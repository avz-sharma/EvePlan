"""Replanning routers: deterministic POST endpoint + 3-stage SSE streaming endpoint.

The SSE endpoint streams in strict sequence:
  1. event: delta    → validated PlanDelta JSON
  2. event: engine_diff → deterministic CascadeDiff, updated EventPlan, and TradeOffOptions (<10ms)
  3. event: rationale → human-friendly explanation (templated or LLM-generated)
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from ..engine.budget_tradeoffs import evaluate_budget_tradeoffs
from ..engine.cascade_replanner import apply_delta, apply_event_plan_delta
from ..schemas.intent_delta import CascadeDiff, PlanDelta, TradeOffOption
from ..schemas.plan_state import EventPlan
from ..services.event_catalog import load_event_catalog
from ..services.fallback_parser import parse_user_intent
from ..services.gemini_extractor import (
    IntentExtractionUnavailable,
    extract_intent_delta,
    is_gemini_available,
)
from ..services.quota_guard import quota_guard

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plan", tags=["Replanning"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ReplanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: EventPlan = Field(description="Current client-persisted plan state")
    delta: PlanDelta = Field(description="Structured delta to apply")


class ReplanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    updated_plan: EventPlan = Field(description="Healed and rescheduled plan state")
    diff: CascadeDiff = Field(description="Exact impact diff with hop levels and violations")
    tradeoff_options: list[TradeOffOption] = Field(
        default_factory=list, description="Deterministic recovery options if budget is breached"
    )
    is_cached_fixture: bool = Field(
        default=False, description="True if served from pre-computed zero-quota fixture"
    )
    degraded_mode: bool = Field(
        default=False, description="True if Gemini was unavailable and fallback was used"
    )


class NaturalLanguageReplanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: EventPlan = Field(description="Current client-persisted plan state")
    user_prompt: str = Field(
        min_length=1, max_length=500, description="Free-text user instruction (capped at 500 chars)"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_templated_rationale(diff: CascadeDiff, options: list[TradeOffOption]) -> str:
    """Generate a human-readable rationale from deterministic engine facts (zero LLM)."""
    parts: list[str] = [diff.summary]
    if diff.violations:
        parts.append(f"⚠️ {len(diff.violations)} constraint violation(s) detected.")
    if options:
        option_titles = ", ".join(f'"{o.title}"' for o in options[:3])
        parts.append(
            f"The engine has computed {len(options)} recovery option(s): {option_titles}. "
            "Hover over any card to preview the budget impact before committing."
        )
    else:
        parts.append("The plan budget remains within the sanctioned ceiling after this change.")
    return " ".join(parts)


def _run_deterministic_replan(
    plan: EventPlan, delta: PlanDelta
) -> tuple[EventPlan, CascadeDiff, list[TradeOffOption]]:
    """Core deterministic engine pipeline: apply delta → budget tradeoffs."""
    if plan.days:
        updated_plan, diff = apply_event_plan_delta(plan, delta, load_event_catalog(), date.today())
    else:
        updated_plan, diff = apply_delta(plan, delta)
    _, tradeoff_options, _ = evaluate_budget_tradeoffs(
        buckets=updated_plan.budget_buckets,
        total_budget_cap_inr=updated_plan.total_budget_cap_inr,
        guest_count=updated_plan.guest_count,
        per_plate_min_inr=updated_plan.per_plate_min_inr,
        per_plate_max_inr=updated_plan.per_plate_max_inr,
        buffer_percentage=updated_plan.contingency_percent / 100,
    )
    return updated_plan, diff, tradeoff_options


# ---------------------------------------------------------------------------
# POST /api/plan/replan — synchronous deterministic endpoint
# ---------------------------------------------------------------------------


@router.post("/replan", response_model=ReplanResponse)
async def replan_event(req: ReplanRequest) -> ReplanResponse:
    """Pure deterministic replanning endpoint complying with LAW-01 & Free-Tier guidelines."""
    try:
        updated_plan, diff, tradeoff_options = await run_in_threadpool(_run_deterministic_replan, req.plan, req.delta)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return ReplanResponse(
        updated_plan=updated_plan,
        diff=diff,
        tradeoff_options=tradeoff_options,
        is_cached_fixture=False,
        degraded_mode=False,
    )


# ---------------------------------------------------------------------------
# POST /api/plan/replan/stream — 3-stage SSE endpoint
# ---------------------------------------------------------------------------


@router.post("/replan/stream")
async def replan_stream(req: NaturalLanguageReplanRequest) -> StreamingResponse:
    """3-stage SSE streaming endpoint for natural language replanning.

    Stream sequence:
      event: delta       → validated PlanDelta JSON
      event: engine_diff → CascadeDiff + updated plan + trade-off options (immediate)
      event: rationale   → human explanation (templated, with optional LLM enhancement)
    """

    async def event_generator() -> AsyncIterator[str]:
        plan_json = req.plan.model_dump_json()
        degraded = False

        # ── Stage 1: Extract PlanDelta ────────────────────────────────
        gemini_available = is_gemini_available()
        delta_dict: dict = {}  # type: ignore[type-arg]
        is_cached = False

        if gemini_available:
            try:
                delta_dict, is_cached = await run_in_threadpool(extract_intent_delta, plan_json, req.user_prompt)
            except IntentExtractionUnavailable:
                fallback_delta, _ = parse_user_intent(req.user_prompt)
                delta_dict = fallback_delta.model_dump()
                gemini_available = False
                degraded = True
        else:
            # Fallback to deterministic regex parser
            fallback_delta, did_extract = parse_user_intent(req.user_prompt)
            delta_dict = fallback_delta.model_dump()
            degraded = not did_extract  # only mark degraded if nothing extracted
            if not did_extract:
                degraded = True

        delta = PlanDelta(**delta_dict)

        delta_payload = json.dumps(
            {
                "delta": delta.model_dump(),
                "source": "cache" if is_cached else ("gemini" if gemini_available else "fallback"),
                "degraded_mode": degraded,
                "remaining_quota": quota_guard.remaining_daily(),
            }
        )
        yield f"event: delta\ndata: {delta_payload}\n\n"

        # ── Stage 2: Deterministic Engine Diff (immediate, <10ms) ─────
        updated_plan, diff, tradeoff_options = await run_in_threadpool(_run_deterministic_replan, req.plan, delta)

        engine_payload = json.dumps(
            {
                "updated_plan": json.loads(updated_plan.model_dump_json()),
                "diff": json.loads(diff.model_dump_json()),
                "tradeoff_options": [
                    json.loads(o.model_dump_json()) for o in tradeoff_options
                ],
            }
        )
        yield f"event: engine_diff\ndata: {engine_payload}\n\n"

        # ── Stage 3: Rationale (templated default, LLM-enhanced optional) ──
        templated_rationale = _build_templated_rationale(diff, tradeoff_options)

        # The intent extraction consumes the one allowed LLM call.
        # Rationale comes entirely from the checked engine output.
        rationale_payload = json.dumps(
            {
                "rationale": templated_rationale,
                "source": "template",
                "degraded_mode": True,
            }
        )
        yield f"event: rationale\ndata: {rationale_payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/plan/quota — current quota status for UI badges
# ---------------------------------------------------------------------------


@router.get("/quota")
async def get_quota_status() -> dict[str, object]:
    """Returns current Gemini quota availability for frontend status badges."""
    return {
        "gemini_available": is_gemini_available(),
        "remaining_daily": quota_guard.remaining_daily(),
        "seconds_until_rpm": round(quota_guard.seconds_until_rpm_available(), 1),
    }

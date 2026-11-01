import json
from importlib import import_module

from fastapi.testclient import TestClient

from app.engine.plan_builder import build_event_plan
from app.main import app
from app.schemas.plan_state import EventDay, PlanEvent
from app.services.event_catalog import load_event_catalog
from app.services.groq_extractor import IntentExtractionUnavailable
from tests.plan_factory import TODAY, generated_plan

replan_router = import_module("app.routers.replan_router")


def test_stream_uses_one_intent_call_and_template_rationale(monkeypatch):
    calls = []
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: True)

    def extract(_plan, prompt):
        calls.append(prompt)
        return {"guest_count_delta": 40}, False

    def second_call(*_args):
        raise AssertionError("A replan must not spend a second LLM call on rationale")

    monkeypatch.setattr(replan_router, "extract_intent_delta", extract)
    monkeypatch.setattr(replan_router, "generate_rationale", second_call, raising=False)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "+40 guests",
        })
    assert response.status_code == 200
    assert calls == ["+40 guests"]
    assert '"source": "template"' in response.text


def test_stream_uses_parser_when_provider_or_quota_is_unavailable(monkeypatch):
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: True)

    def unavailable(*_args):
        raise IntentExtractionUnavailable("Mock quota exhaustion")

    monkeypatch.setattr(replan_router, "extract_intent_delta", unavailable)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "+40 guests",
        })
    assert '"source": "fallback"' in response.text
    assert '"guest_count": 160' in response.text
    assert '"degraded_mode": true' in response.text


def stream_events(response):
    return {
        block.splitlines()[0].removeprefix("event: "): json.loads(block.splitlines()[1].removeprefix("data: "))
        for block in response.text.strip().split("\n\n")
    }


def test_eight_event_budget_and_absolute_guest_change_without_provider(monkeypatch):
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: False)
    draft = generated_plan(1).model_copy(update={
        "guest_count": 70, "per_plate_min_inr": 400, "per_plate_max_inr": 2500,
        "budget_range_min_inr": 1_500_000, "budget_range_max_inr": 2_000_000,
        "days": [EventDay(day_number=day, events=[
            PlanEvent(id=f"event-{day}-{event}", catalog_id="sangeet")
            for event in range(count)
        ]) for day, count in enumerate([3, 2, 3], start=1)],
    })
    plan = build_event_plan(draft, load_event_catalog(), TODAY)
    catering = next(bucket for bucket in plan.budget_buckets if bucket.category == "Catering")
    assert catering.allocated_min_inr == 224_000
    assert catering.allocated_max_inr == 1_400_000
    assert catering.contingency_inr == 140_000
    projected = sum(bucket.allocated_max_inr + bucket.contingency_inr for bucket in plan.budget_buckets)
    assert projected / plan.total_budget_cap_inr == 0.77
    # Include a custom attendance count to verify an exact all-events reset.
    plan.days[0].events[0] = plan.days[0].events[0].model_copy(update={"guest_count": 60})
    original = plan.model_dump(mode="json")
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": original, "user_prompt": "only 50 guests to the events",
        })
    events = stream_events(response)
    updated = events["engine_diff"]["updated_plan"]
    assert updated["guest_count"] == 50
    assert all(event["guest_count"] == 50 for day in updated["days"] for event in day["events"])
    projected = sum(bucket["allocated_max_inr"] + bucket["contingency_inr"] for bucket in updated["budget_buckets"])
    assert projected == 1_100_000
    assert projected / updated["total_budget_cap_inr"] == 0.55
    assert plan.model_dump(mode="json") == original


def test_absolute_count_survives_provider_failure(monkeypatch):
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: True)

    def unavailable(*_args):
        raise IntentExtractionUnavailable("Provider unavailable")

    monkeypatch.setattr(replan_router, "extract_intent_delta", unavailable)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "only 50 guests",
        })
    assert stream_events(response)["engine_diff"]["updated_plan"]["guest_count"] == 50


def test_stream_reports_validation_reason_without_applying_change(monkeypatch):
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: False)
    plan = generated_plan(1).model_copy(update={"special_diets": {"jain": 60}})
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": plan.model_dump(mode="json"), "user_prompt": "only 50 guests",
        })
    events = stream_events(response)
    assert "engine_diff" not in events
    assert events["error"]["message"] == "Special-diet counts cannot exceed the total guest count"


def test_unrecognized_prompt_is_not_reported_as_success(monkeypatch):
    monkeypatch.setattr(replan_router, "is_groq_available", lambda: False)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "hello there",
        })
    events = stream_events(response)
    assert list(events) == ["error"]
    assert 'only 50 guests' in events["error"]["message"]

"""Quotation mutations with budget and task reconciliation."""

from __future__ import annotations

from datetime import date
from typing import Any, Mapping

from ..schemas.intent_delta import CascadeDiff
from ..schemas.plan_state import (
    EventPlan,
    SavedQuote,
)
from .event_metadata import (
    VENDOR_CATEGORY_LABELS,
)
from .plan_builder import build_event_plan
from .plan_diff import (
    changed_budget_categories,
    dependent_hops,
    vendor_capacity_violations,
)
from .quote_selection import effective_assignments


def mutate_quote(
    plan: EventPlan,
    catalog: Mapping[str, Any],
    today: date,
    operation: str,
    quote: SavedQuote | None = None,
    quote_id: str | None = None,
    contingency_percent: float | None = None,
) -> tuple[EventPlan, CascadeDiff]:
    quotes = list(plan.saved_quotes)
    target = next((q for q in quotes if q.id == quote_id), None)
    assignments = list(plan.vendor_assignments)
    if operation == "save":
        if quote is None:
            raise ValueError("Quotation is required")
        previous = next((q for q in quotes if q.id == quote.id), None)
        if previous and (previous.event_id, previous.category) != (quote.event_id, quote.category):
            raise ValueError(
                "Quotation event/category cannot change; remove it and add a new quotation"
            )
        target = quote
        quotes = [q for q in quotes if q.id != quote.id] + [quote]
    elif operation in {"select", "remove"}:
        if target is None:
            raise ValueError("Quotation was not found")
        if operation == "remove":
            quotes = [q for q in quotes if q.id != quote_id]
        else:
            target = target.model_copy(update={"selected": True})
    elif operation != "contingency":
        raise ValueError("Unknown quotation operation")
    if target and target.selected and operation != "remove":
        quotes = [
            q.model_copy(update={"selected": q.id == target.id})
            if (q.event_id, q.category) == (target.event_id, target.category)
            else q
            for q in quotes
        ]
        assignments = [
            a for a in assignments if (a.event_id, a.category) != (target.event_id, target.category)
        ]
    candidate = plan.model_copy(
        update={
            "saved_quotes": quotes,
            "vendor_assignments": assignments,
            "contingency_percent": plan.contingency_percent
            if contingency_percent is None
            else contingency_percent,
        }
    )
    old_groups = {
        (a.event_id, VENDOR_CATEGORY_LABELS[a.category.value]) for a in effective_assignments(plan)
    }
    new_groups = {
        (a.event_id, VENDOR_CATEGORY_LABELS[a.category.value])
        for a in effective_assignments(candidate)
    }
    removed_groups = old_groups - new_groups
    candidate = candidate.model_copy(
        update={
            "tasks": [
                t.model_copy(update={"status": "PENDING"})
                if (t.event_id, t.budget_category) in removed_groups and t.status == "IN_PROGRESS"
                else t
                for t in candidate.tasks
            ]
        }
    )
    updated = build_event_plan(candidate, catalog, today)
    changed = changed_budget_categories(plan.budget_buckets, updated.budget_buckets)
    roots = {
        t.id
        for t in updated.tasks
        if target
        and t.event_id == target.event_id
        and t.budget_category == VENDOR_CATEGORY_LABELS[target.category.value]
    }
    hops = dependent_hops(updated.tasks, roots)
    return updated, CascadeDiff(
        mutated_attribute="quotation",
        affected_task_ids=sorted(hops),
        affected_budget_categories=sorted(changed),
        node_hops=hops,
        violations=vendor_capacity_violations(updated),
        summary="Saved quotations, selected vendor costs and contingency recalculated.",
    )

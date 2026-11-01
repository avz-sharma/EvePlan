"""Event and day edits followed by a deterministic rebuild."""

from __future__ import annotations

from datetime import date

from ..schemas.catalog import EventCatalog
from ..schemas.intent_delta import CascadeDiff
from ..schemas.plan_state import (
    EventPlan,
    PlanEvent,
)
from .event_edits import EventEdit
from .plan_builder import build_event_plan
from .plan_diff import (
    changed_budget_categories,
    dependent_hops,
    vendor_capacity_violations,
)


def edit_event_plan(
    plan: EventPlan,
    catalog: EventCatalog,
    today: date,
    operation: str,
    *,
    event_id: str | None = None,
    day_number: int | None = None,
    event: PlanEvent | None = None,
    guest_count: int | None = None,
    target_day_number: int | None = None,
) -> tuple[EventPlan, CascadeDiff]:
    """Apply one event/day edit and rebuild dependent dates, budgets, hints, and tasks."""
    days = [day.model_copy(deep=True) for day in plan.days]
    old_task_ids = {task.id for task in plan.tasks if task.event_id == event_id}
    roots, affected_categories = EventEdit(
        plan, days, event_id, day_number, event, guest_count, target_day_number
    ).apply(operation)

    remaining_event_ids = {event.id for day in days for event in day.events}
    candidate = plan.model_copy(
        update={
            "days": days,
            "saved_quotes": [
                quote for quote in plan.saved_quotes if quote.event_id in remaining_event_ids
            ],
            "vendor_assignments": [
                assignment
                for assignment in plan.vendor_assignments
                if assignment.event_id in remaining_event_ids
            ],
        }
    )
    rebuilt = build_event_plan(candidate, catalog, today)
    removed_ids = old_task_ids
    if operation == "remove_day":
        surviving_ids = {event.id for day in rebuilt.days for event in day.events}
        removed_ids = {task.id for task in plan.tasks if task.event_id not in surviving_ids}
    old_hops = (
        dependent_hops(plan.tasks, removed_ids)
        if operation in {"remove_event", "remove_day"}
        else {}
    )
    hops = dependent_hops(rebuilt.tasks, roots)
    if old_hops:
        for task_id, hop in old_hops.items():
            hops.setdefault(task_id, hop)
    affected = set(hops)
    changed_budgets = changed_budget_categories(plan.budget_buckets, rebuilt.budget_buckets)
    summary = f"{operation.replace('_', ' ').capitalize()} updated {len(affected)} dependent task(s) across {len(rebuilt.days)} day(s)."
    diff = CascadeDiff(
        mutated_attribute=operation,
        affected_task_ids=sorted(affected),
        affected_budget_categories=sorted(affected_categories | changed_budgets),
        node_hops=hops,
        violations=vendor_capacity_violations(rebuilt),
        summary=summary,
    )
    return rebuilt, diff

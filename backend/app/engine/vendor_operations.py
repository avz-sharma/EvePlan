"""Vendor assignment and its dependent budget and task effects."""

from __future__ import annotations

from datetime import date

from ..schemas.catalog import EventCatalog
from ..schemas.intent_delta import CascadeDiff
from ..schemas.plan_state import (
    EventPlan,
    VendorAssignment,
)
from .event_metadata import (
    VENDOR_CATEGORY_LABELS,
)
from .plan_builder import build_event_plan
from .plan_diff import (
    dependent_hops,
    event_guest_counts,
)


def assign_vendor(
    plan: EventPlan,
    catalog: EventCatalog,
    today: date,
    assignment: VendorAssignment,
) -> tuple[EventPlan, CascadeDiff]:
    """Replace the vendor for one event/category and re-evaluate its plan branch."""
    if not any(event.id == assignment.event_id for day in plan.days for event in day.events):
        raise ValueError("Vendor assignment event was not found")
    assignments = [
        item
        for item in plan.vendor_assignments
        if not (item.event_id == assignment.event_id and item.category == assignment.category)
    ] + [assignment]
    updated = build_event_plan(
        plan.model_copy(
            update={
                "vendor_assignments": assignments,
                "saved_quotes": [
                    q.model_copy(update={"selected": False})
                    if q.event_id == assignment.event_id and q.category == assignment.category
                    else q
                    for q in plan.saved_quotes
                ],
            }
        ),
        catalog,
        today,
    )
    task_category = VENDOR_CATEGORY_LABELS[assignment.category.value]
    updated.tasks = [
        task.model_copy(update={"status": "IN_PROGRESS"})
        if task.event_id == assignment.event_id and task.budget_category == task_category
        else task
        for task in updated.tasks
    ]
    roots = {
        task.id
        for task in updated.tasks
        if task.event_id == assignment.event_id and task.budget_category == task_category
    }
    hops = dependent_hops(updated.tasks, roots)
    event_guests = event_guest_counts(updated)[assignment.event_id]
    violations = []
    if assignment.capacity is not None and assignment.capacity < event_guests:
        violations.append(
            f"{assignment.category.value} vendor capacity ({assignment.capacity}) is below event attendance ({event_guests})."
        )
    diff = CascadeDiff(
        mutated_attribute="vendor_assignment",
        affected_task_ids=sorted(hops),
        affected_budget_categories=[
            next(
                (
                    bucket.category
                    for bucket in updated.budget_buckets
                    if bucket.category == task_category
                ),
                assignment.category.value.title(),
            )
        ],
        node_hops=hops,
        violations=violations,
        summary=f"Vendor quote added to {assignment.category.value} for this event; {len(hops)} task(s) are affected.",
    )
    return updated, diff

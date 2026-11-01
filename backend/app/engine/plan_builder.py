"""Resolve a celebration draft into tasks, budgets and host hints."""

from __future__ import annotations

from datetime import date, timedelta

from ..schemas.catalog import EventCatalog
from ..schemas.plan_state import (
    EventPlan,
    PlanEvent,
)
from .budget_builder import build_budgets
from .event_metadata import (
    VENDOR_CATEGORY_LABELS,
    build_hints,
    index_catalog,
)
from .quote_selection import effective_assignments, validate_quotes
from .task_builder import build_tasks


def build_event_plan(
    plan: EventPlan,
    catalog: EventCatalog,
    today: date,
    *,
    allow_incomplete: bool = False,
) -> EventPlan:
    """Resolve the onboarding draft into an event-aware plan, task DAG, and budgets."""
    if plan.first_event_date is None:
        raise ValueError("First event date is required")
    if not plan.days:
        raise ValueError("At least one celebration day is required")
    if plan.total_budget_cap_inr <= 0 and not allow_incomplete:
        raise ValueError("Total budget is required")
    if (plan.budget_range_min_inr <= 0 or plan.budget_range_max_inr <= 0) and not allow_incomplete:
        raise ValueError("Total budget range is required")
    if (plan.per_plate_min_inr <= 0 or plan.per_plate_max_inr <= 0) and not allow_incomplete:
        raise ValueError("Per-plate budget range is required")
    if plan.per_plate_min_inr > plan.per_plate_max_inr and plan.per_plate_max_inr > 0:
        raise ValueError("Minimum per-plate budget cannot exceed maximum")

    days = sorted(plan.days, key=lambda item: item.day_number)
    for day_index, day in enumerate(days):
        if day.day_number != day_index + 1:
            raise ValueError("Day numbers must be consecutive, starting at 1")
        event_date = plan.first_event_date + timedelta(days=day_index)
        events: list[PlanEvent] = []
        for event in day.events:
            count = plan.guest_count if event.guest_count is None else event.guest_count
            events.append(event.model_copy(update={"guest_count": count}))
        days[day_index] = day.model_copy(update={"date": event_date, "events": events})

    resolved = plan.model_copy(
        update={
            "days": days,
            "total_budget_cap_inr": plan.budget_range_max_inr or plan.total_budget_cap_inr,
        }
    )
    validate_quotes(resolved)
    index = index_catalog(catalog)
    prior_status = {task.id: task.status for task in plan.tasks}
    resolved.profile_hints = build_hints(resolved, catalog, index)
    tasks = build_tasks(resolved, catalog, index)
    assigned_categories = {
        (assignment.event_id, VENDOR_CATEGORY_LABELS[assignment.category.value])
        for assignment in effective_assignments(resolved)
    }
    resolved.tasks = [
        task.model_copy(
            update={
                "status": (
                    "COMPLETED"
                    if prior_status.get(task.id) == "COMPLETED"
                    else "IN_PROGRESS"
                    if (task.event_id, task.budget_category) in assigned_categories
                    else prior_status.get(task.id, "PENDING")
                )
            }
        )
        for task in tasks
    ]
    resolved.budget_buckets = build_budgets(resolved, catalog, index)
    resolved.days_until_event = max(0, (plan.first_event_date - today).days)
    resolved.dietary_split = resolved.dietary_split.model_copy(
        update={
            "regular": max(0, plan.guest_count - sum(plan.special_diets.values())),
            "jain": plan.special_diets.get("jain", 0),
            "vegan": plan.special_diets.get("vegan", 0),
        }
    )
    resolved.accessibility = resolved.accessibility.model_copy(
        update={"elderly_count": plan.elder_members}
    )
    return resolved

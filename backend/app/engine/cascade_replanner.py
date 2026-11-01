"""Event-aware replanning orchestration and legacy entry point."""

from datetime import date
from typing import Any, Mapping

from ..schemas.intent_delta import CascadeDiff, PlanDelta
from ..schemas.plan_state import EventPlan
from .event_delta import EventDelta
from .legacy_replanner import apply_delta as apply_delta
from .plan_builder import build_event_plan
from .plan_diff import changed_budget_categories, dependent_hops, vendor_capacity_violations


def apply_event_plan_delta(
    plan: EventPlan,
    delta: PlanDelta,
    catalog: Mapping[str, Any],
    today: date,
) -> tuple[EventPlan, CascadeDiff]:
    """Apply legacy intent fields to selected events and rebuild their derived state."""
    if not plan.days or plan.first_event_date is None:
        raise ValueError("An event plan with days and a first event date is required")

    days = [day.model_copy(deep=True) for day in plan.days]
    # Derived tasks/budgets are rebuilt, so only copy mutable inputs here.
    candidate = plan.model_copy(update={"notes": list(plan.notes)})
    change = EventDelta(plan, delta, days, candidate)
    change.apply()
    roots, categories, mutated = change.roots, change.categories, change.mutated

    candidate.days = days
    if any(count > candidate.guest_count for count in candidate.special_diets.values()):
        raise ValueError("Special-diet counts cannot exceed the total guest count")
    if delta.new_constraints:
        candidate.notes.extend(delta.new_constraints)
    rebuilt = build_event_plan(candidate, catalog, today)

    if delta.venue_capacity_override is not None:
        for day in rebuilt.days:
            for event in day.events:
                if event.guest_count and event.guest_count > delta.venue_capacity_override:
                    message = f"Venue capacity ({delta.venue_capacity_override}) is below attendance ({event.guest_count}) for {event.custom_name or event.catalog_id}."
                    rebuilt.notes.append(message)

    task_ids = {task.id for task in rebuilt.tasks}
    node_hops = dependent_hops(rebuilt.tasks, roots & task_ids)
    if mutated == "timeline_days":
        node_hops = {task.id: 0 for task in rebuilt.tasks}

    changed_categories = changed_budget_categories(plan.budget_buckets, rebuilt.budget_buckets)
    violations = vendor_capacity_violations(rebuilt)
    violations.extend(note for note in rebuilt.notes if "Venue capacity" in note)
    diff = CascadeDiff(
        mutated_attribute=mutated,
        affected_task_ids=sorted(node_hops),
        affected_budget_categories=sorted(categories | changed_categories),
        node_hops=node_hops,
        violations=violations,
        summary=f"Applied {mutated.replace('_', ' ')} change across {len(rebuilt.days)} celebration day(s).",
    )
    return rebuilt, diff

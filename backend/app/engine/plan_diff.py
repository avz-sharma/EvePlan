"""Linear impact lookups shared by event edits and intent cascades."""

from collections.abc import Sequence

from ..schemas.plan_state import BudgetBucket, EventPlan


def changed_budget_categories(before: Sequence[BudgetBucket], after: Sequence[BudgetBucket]) -> set[str]:
    old: dict[str, BudgetBucket] = {}
    new: dict[str, BudgetBucket] = {}
    for bucket in before:
        old.setdefault(bucket.category, bucket)
    for bucket in after:
        new.setdefault(bucket.category, bucket)
    return {bucket.category for bucket in before if new.get(bucket.category) != bucket} | {
        bucket.category for bucket in after if old.get(bucket.category) != bucket
    }


def event_guest_counts(plan: EventPlan) -> dict[str, int]:
    # The builder resolves optional counts before these checks run.
    return {event.id: event.guest_count or 0 for day in plan.days for event in day.events}


def vendor_capacity_violations(plan: EventPlan) -> list[str]:
    guests = event_guest_counts(plan)
    return [
        f"{item.category.value} vendor capacity ({item.capacity}) is below event attendance ({guests.get(item.event_id, 0)})."
        for item in plan.vendor_assignments
        if item.capacity is not None and item.capacity < guests.get(item.event_id, 0)
    ]

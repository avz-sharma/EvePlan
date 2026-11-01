"""Linear impact lookups shared by event edits and intent cascades."""

from collections import defaultdict, deque
from collections.abc import Sequence

from ..schemas.plan_state import BudgetBucket, EventPlan, TaskNode


def changed_budget_categories(
    before: Sequence[BudgetBucket], after: Sequence[BudgetBucket]
) -> set[str]:
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


def dependent_hops(tasks: list[TaskNode], roots: set[str]) -> dict[str, int]:
    successors: dict[str, list[str]] = defaultdict(list)
    task_ids = {task.id for task in tasks}
    for task in tasks:
        for dependency in task.dependencies:
            successors[dependency].append(task.id)
    hops: dict[str, int] = {}
    queue = deque((root, 0) for root in roots)
    while queue:
        task_id, hop = queue.popleft()
        if task_id in hops and hops[task_id] <= hop:
            continue
        hops[task_id] = hop
        if task_id in task_ids:
            for successor in successors[task_id]:
                queue.append((successor, hop + 1))
    return hops

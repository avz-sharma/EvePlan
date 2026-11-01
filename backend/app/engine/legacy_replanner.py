"""Replanning for legacy task-only plans kept for saved-plan compatibility."""

from collections import defaultdict, deque

from ..schemas.intent_delta import CascadeDiff, PlanDelta
from ..schemas.plan_state import EventPlan
from .budget_tradeoffs import evaluate_budget_tradeoffs
from .conflict_rules import evaluate_conflicts
from .dependency_scheduler import compute_cpm_schedule


def apply_delta(plan: EventPlan, delta: PlanDelta) -> tuple[EventPlan, CascadeDiff]:
    """Pure deterministic replanning function complying with LAW-01.

    Applies PlanDelta to EventPlan, recomputes CPM, budget contingency,
    accessibility & venue conflicts, and computes exact node hop distances
    so frontend can stagger ripple animations by 80ms * hop_level.
    """
    updated_plan = plan.model_copy(deep=True)
    affected_tasks: set[str] = set()
    affected_categories: set[str] = set()
    root_task_id = "task_venue_booking"
    mutated_attr = "general"

    # 1. Apply Headcount Mutations
    if delta.guest_count_delta != 0 or delta.guest_count_override is not None:
        mutated_attr = "guest_count"
        updated_plan.guest_count = (
            delta.guest_count_override
            if delta.guest_count_override is not None
            else max(1, updated_plan.guest_count + delta.guest_count_delta)
        )
        root_task_id = "task_catering_headcount"
        affected_tasks.add(root_task_id)
        affected_categories.add("Catering")
        affected_categories.add("Logistics & Transport")

    # 2. Apply Per-Plate Catering Rate Shifts
    if delta.per_plate_delta_inr != 0:
        mutated_attr = "per_plate_rate"
        updated_plan.per_plate_min_inr = max(
            1.0, updated_plan.per_plate_min_inr + delta.per_plate_delta_inr
        )
        updated_plan.per_plate_max_inr = max(
            updated_plan.per_plate_min_inr,
            updated_plan.per_plate_max_inr + delta.per_plate_delta_inr,
        )
        root_task_id = "task_catering_contract"
        affected_tasks.add(root_task_id)
        affected_categories.add("Catering")

    # 3. Apply Timeline Date Shifts
    if delta.days_until_event_delta != 0:
        mutated_attr = "timeline_days"
        updated_plan.days_until_event = max(
            1, updated_plan.days_until_event + delta.days_until_event_delta
        )
        root_task_id = "task_venue_booking"
        affected_tasks.add(root_task_id)
        affected_categories.add("Venue")
        affected_categories.add("Logistics & Transport")

    # 4. Apply Venue Capacity Overrides & Weather Moves
    if delta.venue_capacity_override is not None:
        mutated_attr = "venue_capacity"
        updated_plan.venue_capacity = delta.venue_capacity_override
        root_task_id = "task_venue_booking"
        affected_tasks.add(root_task_id)
        affected_categories.add("Venue")

    if delta.indoor_relocation:
        mutated_attr = "weather_indoor_move"
        decor_tasks = [
            task
            for task in updated_plan.tasks
            if "decor" in f"{task.category} {task.title}".casefold()
        ]
        venue_tasks = [
            task
            for task in updated_plan.tasks
            if "venue" in f"{task.category} {task.title}".casefold()
        ]
        roots = decor_tasks or venue_tasks
        if roots:
            root_task_id = roots[0].id
            affected_tasks.update(task.id for task in roots)
        affected_categories.add("Decor")
        updated_plan.notes.append("An outdoor event was moved indoors after a venue change.")

    # 5. Apply Jain Dietary Adjustments
    if delta.dietary_jain_delta != 0:
        updated_plan.dietary_split.jain = max(
            0, updated_plan.dietary_split.jain + delta.dietary_jain_delta
        )
        affected_tasks.add("task_catering_headcount")
        affected_categories.add("Catering")

    # 6. Apply Budget Cap Adjustments
    if delta.budget_cap_inr_delta != 0:
        updated_plan.total_budget_cap_inr = max(
            1.0, updated_plan.total_budget_cap_inr + delta.budget_cap_inr_delta
        )

    # 7. Update Budget Buckets for Headcount & Rate Scaling
    for i, bucket in enumerate(updated_plan.budget_buckets):
        if "Catering" in bucket.category:
            new_min = round(updated_plan.guest_count * updated_plan.per_plate_min_inr, 2)
            new_max = round(updated_plan.guest_count * updated_plan.per_plate_max_inr, 2)
            updated_plan.budget_buckets[i] = bucket.model_copy(
                update={"allocated_min_inr": new_min, "allocated_max_inr": new_max}
            )
        elif "Logistics" in bucket.category and updated_plan.guest_count != plan.guest_count:
            scale_ratio = updated_plan.guest_count / plan.guest_count
            new_min = round(bucket.allocated_min_inr * scale_ratio, 2)
            new_max = round(bucket.allocated_max_inr * scale_ratio, 2)
            updated_plan.budget_buckets[i] = bucket.model_copy(
                update={"allocated_min_inr": new_min, "allocated_max_inr": new_max}
            )

    # 8. Re-evaluate Budget Contingency & Trade-offs
    updated_buckets, _, _ = evaluate_budget_tradeoffs(
        updated_plan.budget_buckets,
        updated_plan.total_budget_cap_inr,
        updated_plan.guest_count,
        updated_plan.per_plate_min_inr,
        updated_plan.per_plate_max_inr,
        updated_plan.contingency_percent / 100,
    )
    updated_plan.budget_buckets = updated_buckets

    # 9. Evaluate Conflicts
    violations, tasks_to_reopen = evaluate_conflicts(updated_plan)
    for t_id in tasks_to_reopen:
        affected_tasks.add(t_id)

    # 10. Compute Forward Graph Adjacency for Hop Level Propagation
    adj: dict[str, list[str]] = defaultdict(list)
    for task in updated_plan.tasks:
        for dep_id in task.dependencies:
            adj[dep_id].append(task.id)

    # BFS from affected tasks to propagate cascade ripple hop levels
    node_hops: dict[str, int] = {}
    task_ids = {task.id for task in updated_plan.tasks}
    queue: deque[tuple[str, int]] = deque(
        [(t_id, 0) for t_id in affected_tasks if t_id in task_ids]
    )
    if not queue and updated_plan.tasks:
        queue.append((updated_plan.tasks[0].id, 0))

    while queue:
        curr_id, hop = queue.popleft()
        if curr_id in node_hops and node_hops[curr_id] <= hop:
            continue
        node_hops[curr_id] = hop
        affected_tasks.add(curr_id)

        for succ_id in adj[curr_id]:
            if succ_id not in node_hops or node_hops[succ_id] > hop + 1:
                queue.append((succ_id, hop + 1))

    # Re-compute CPM schedule
    updated_tasks = compute_cpm_schedule(updated_plan.tasks)
    for task in updated_tasks:
        task.hop_level = node_hops.get(task.id, 0)
        if task.id in tasks_to_reopen:
            task.status = "PENDING"
    updated_plan.tasks = updated_tasks

    summary_text = (
        f"Applied {mutated_attr} change: {len(affected_tasks)} tasks rescheduled across "
        f"{max(node_hops.values(), default=0)} hops. "
        f"{len(violations)} conflict(s) flagged."
    )

    diff = CascadeDiff(
        mutated_attribute=mutated_attr,
        affected_task_ids=sorted(list(affected_tasks)),
        affected_budget_categories=sorted(list(affected_categories)),
        node_hops=node_hops,
        violations=violations,
        summary=summary_text,
    )

    return updated_plan, diff

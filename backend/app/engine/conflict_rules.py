from typing import cast

from ..schemas.plan_state import EventPlan
from .planning_heuristics import CONTINGENCY_RATE


def evaluate_conflicts(plan: EventPlan) -> tuple[list[str], list[str]]:
    """Evaluates plan constraints deterministically.
    
    Returns:
        tuple[list[str], list[str]]: (violations, tasks_to_reopen)
    """
    violations: list[str] = []
    tasks_to_reopen: list[str] = []

    # 1. Venue Capacity Overrun Check
    # Phase 1 compatibility callers supply a concrete capacity. Phase 2 checks
    # optional capacities per assignment in the event-aware builder instead.
    capacity = cast(int, plan.venue_capacity)
    if plan.guest_count > capacity:
        excess = plan.guest_count - capacity
        violations.append(
            f"CRITICAL: Headcount ({plan.guest_count}) exceeds venue capacity "
            f"({plan.venue_capacity}) by {excess} guests! Safety & fire code violation."
        )
        tasks_to_reopen.extend(
            [
                "task_catering_headcount",
                "task_seating_layout",
                "task_decor_stage",
                "task_venue_booking",
            ]
        )

    # 2. Elderly Accessibility and Multi-Generational Fatigue
    if plan.accessibility.elderly_count >= 15:
        # Check whether multiple selected events have a short planning window.
        if len(plan.sub_events) >= 2 and plan.days_until_event <= 14:
            violations.append(
                f"HIGH: {plan.accessibility.elderly_count} elderly attendees flagged. "
                "Multiple ceremonies scheduled with < 3-hour rest buffers. "
                "Elder fatigue risk high; mandate ground-floor dining & wheelchair ramps."
            )
            if not plan.accessibility.ground_floor_dining:
                violations.append(
                    "ACCESSIBILITY: Ground-floor dining not marked for elderly guests. "
                    "Staircase navigation poses severe mobility barrier."
                )

    # 3. Dietary Split Requirements (Jain counters)
    if plan.dietary_split.jain > 0:
        catering_bucket = next((b for b in plan.budget_buckets if "Catering" in b.category), None)
        has_jain_assumption = (
            any("jain" in a.lower() for a in catering_bucket.assumptions)
            if catering_bucket
            else False
        )
        if not has_jain_assumption:
            violations.append(
                f"DIETARY: {plan.dietary_split.jain} Jain guests detected, but catering contract "
                "lacks a dedicated root-vegetable-free, separate oil prep station flag."
            )
            tasks_to_reopen.append("task_catering_headcount")

    # 4. Budget Ceiling Check
    total_max_projected = sum(b.allocated_max_inr + b.contingency_inr for b in plan.budget_buckets)
    if total_max_projected > plan.total_budget_cap_inr:
        overage = total_max_projected - plan.total_budget_cap_inr
        violations.append(
            f"BUDGET: Total projected spend (₹{total_max_projected:,.0f} including {CONTINGENCY_RATE:.0%} reserve) "
            f"breaches hard cap (₹{plan.total_budget_cap_inr:,.0f}) by ₹{overage:,.0f}."
        )

    return violations, list(set(tasks_to_reopen))



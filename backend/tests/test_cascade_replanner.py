from app.engine.cascade_replanner import apply_delta
from app.schemas.intent_delta import PlanDelta
from app.schemas.plan_state import (
    AccessibilityNeeds,
    BudgetBucket,
    DietarySplit,
    EventPlan,
    SubEventType,
    TaskNode,
)


def create_sample_plan(guest_count: int = 100, venue_capacity: int = 150) -> EventPlan:
    tasks = [
        TaskNode(
            id="task_venue_booking",
            title="Book Wedding Venue",
            category="Venue",
            sub_event=SubEventType.WEDDING,
            duration_days=5,
            dependencies=[],
        ),
        TaskNode(
            id="task_catering_contract",
            title="Sign Catering Contract",
            category="Catering",
            sub_event=SubEventType.WEDDING,
            duration_days=4,
            dependencies=["task_venue_booking"],
        ),
        TaskNode(
            id="task_catering_headcount",
            title="Finalize Catering Headcount",
            category="Catering",
            sub_event=SubEventType.WEDDING,
            duration_days=2,
            dependencies=["task_catering_contract"],
        ),
        TaskNode(
            id="task_seating_layout",
            title="Design Seating & Elderly Access Layout",
            category="Logistics",
            sub_event=SubEventType.WEDDING,
            duration_days=3,
            dependencies=["task_catering_headcount"],
        ),
    ]

    buckets = [
        BudgetBucket(
            category="Venue",
            allocated_min_inr=300000.0,
            allocated_max_inr=400000.0,
            contingency_inr=40000.0,
            assumptions=["Confirmed for 150 cap"],
        ),
        BudgetBucket(
            category="Catering",
            allocated_min_inr=150000.0,
            allocated_max_inr=220000.0,
            contingency_inr=22000.0,
            assumptions=["Includes Jain options"],
        ),
    ]

    return EventPlan(
        id="plan_sample_01",
        title="Sample Sharma-Verma Wedding",
        template="INDIAN_WEDDING",
        guest_count=guest_count,
        total_budget_cap_inr=1_500_000.0,
        per_plate_min_inr=1500.0,
        per_plate_max_inr=2200.0,
        venue_capacity=venue_capacity,
        days_until_event=45,
        dietary_split=DietarySplit(regular=80, jain=15, vegan=5, kids=0),
        accessibility=AccessibilityNeeds(
            elderly_count=18,
            wheelchair_access_required=True,
            ground_floor_dining=True,
        ),
        sub_events=[SubEventType.HALDI, SubEventType.SANGEET, SubEventType.WEDDING],
        budget_buckets=buckets,
        tasks=tasks,
        notes=[],
    )


def test_apply_delta_guest_surge_and_hop_levels() -> None:
    plan = create_sample_plan(guest_count=100, venue_capacity=150)
    delta = PlanDelta(guest_count_delta=40, dietary_jain_delta=10)

    updated_plan, diff = apply_delta(plan, delta)

    # 1. Check guest count updated to 140
    assert updated_plan.guest_count == 140
    assert updated_plan.dietary_split.jain == 25

    # 2. Check catering budget re-scaled
    catering_bucket = next(b for b in updated_plan.budget_buckets if b.category == "Catering")
    assert catering_bucket.allocated_max_inr == 140 * 2200.0

    # 3. Check hop levels: root task_catering_headcount is hop 0, seating_layout is hop 1
    task_map = {t.id: t for t in updated_plan.tasks}
    assert task_map["task_catering_headcount"].hop_level == 0
    assert task_map["task_seating_layout"].hop_level == 1
    assert diff.node_hops["task_seating_layout"] == 1


def test_apply_delta_venue_capacity_overrun_triggers_violations() -> None:
    plan = create_sample_plan(guest_count=100, venue_capacity=120)
    # Surge by 50 -> 150 guests > 120 venue capacity!
    delta = PlanDelta(guest_count_delta=50)

    updated_plan, diff = apply_delta(plan, delta)

    assert updated_plan.guest_count == 150
    assert any("venue capacity" in v.lower() for v in diff.violations)
    # Downstream tasks reopened
    task_map = {t.id: t for t in updated_plan.tasks}
    assert task_map["task_seating_layout"].status == "PENDING"


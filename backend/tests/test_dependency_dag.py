import pytest

from app.engine.dependency_scheduler import (
    CyclicDependencyError,
    compute_cpm_schedule,
    topological_sort_tasks,
)
from app.schemas.plan_state import SubEventType, TaskNode


def test_topological_sort_linear_chain() -> None:
    tasks = [
        TaskNode(
            id="task_c",
            title="Final Payment",
            category="Finance",
            sub_event=SubEventType.WEDDING,
            duration_days=1,
            dependencies=["task_b"],
        ),
        TaskNode(
            id="task_a",
            title="Venue Booking",
            category="Venue",
            sub_event=SubEventType.WEDDING,
            duration_days=5,
            dependencies=[],
        ),
        TaskNode(
            id="task_b",
            title="Decor Finalization",
            category="Decor",
            sub_event=SubEventType.WEDDING,
            duration_days=3,
            dependencies=["task_a"],
        ),
    ]

    sorted_tasks = topological_sort_tasks(tasks)
    ids = [t.id for t in sorted_tasks]
    assert ids == ["task_a", "task_b", "task_c"]


def test_cyclic_dependency_raises_error() -> None:
    cyclic_tasks = [
        TaskNode(
            id="task_1",
            title="Task 1",
            category="General",
            sub_event=SubEventType.HALDI,
            duration_days=2,
            dependencies=["task_2"],
        ),
        TaskNode(
            id="task_2",
            title="Task 2",
            category="General",
            sub_event=SubEventType.HALDI,
            duration_days=3,
            dependencies=["task_1"],
        ),
    ]

    with pytest.raises(CyclicDependencyError):
        topological_sort_tasks(cyclic_tasks)


def test_cpm_critical_path_and_slack_calculation() -> None:
    # Diamond graph:
    # A (duration 5) -> B (duration 3) -> D (duration 2)
    #               -> C (duration 1) -> D (duration 2)
    # Path A-B-D = 5 + 3 + 2 = 10 days (Critical Path, slack = 0)
    # Path A-C-D = 5 + 1 + 2 = 8 days (Slack on C = 2 days)
    tasks = [
        TaskNode(
            id="A",
            title="Task A",
            category="CatA",
            sub_event=SubEventType.WEDDING,
            duration_days=5,
            dependencies=[],
        ),
        TaskNode(
            id="B",
            title="Task B",
            category="CatB",
            sub_event=SubEventType.WEDDING,
            duration_days=3,
            dependencies=["A"],
        ),
        TaskNode(
            id="C",
            title="Task C",
            category="CatC",
            sub_event=SubEventType.WEDDING,
            duration_days=1,
            dependencies=["A"],
        ),
        TaskNode(
            id="D",
            title="Task D",
            category="CatD",
            sub_event=SubEventType.WEDDING,
            duration_days=2,
            dependencies=["B", "C"],
        ),
    ]

    scheduled = compute_cpm_schedule(tasks)
    schedule_map = {t.id: t for t in scheduled}

    # Verify A
    assert schedule_map["A"].earliest_start == 0
    assert schedule_map["A"].is_critical is True
    assert schedule_map["A"].slack_days == 0

    # Verify B (Critical)
    assert schedule_map["B"].earliest_start == 5
    assert schedule_map["B"].is_critical is True
    assert schedule_map["B"].slack_days == 0

    # Verify C (Non-critical, slack of 2 days)
    assert schedule_map["C"].earliest_start == 5
    assert schedule_map["C"].is_critical is False
    assert schedule_map["C"].slack_days == 2

    # Verify D (Critical)
    assert schedule_map["D"].earliest_start == 8
    assert schedule_map["D"].is_critical is True
    assert schedule_map["D"].slack_days == 0

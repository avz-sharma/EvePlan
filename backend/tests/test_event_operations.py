"""Observable event edits and failures across deterministic rebuild boundaries."""

from datetime import timedelta

import pytest

from app.engine.event_operations import edit_event_plan
from app.engine.plan_builder import build_event_plan
from app.schemas.plan_state import PlanEvent
from app.services.event_catalog import load_event_catalog
from tests.plan_factory import TODAY
from tests.test_plan_builder import draft_for


@pytest.mark.parametrize(
    "operation,values,message",
    [
        ("add_event", {}, "Event and day are required"),
        (
            "add_event",
            {"event": PlanEvent(id="new", catalog_id="mehendi"), "day_number": 5},
            "Selected day",
        ),
        ("remove_day", {}, "Selected day"),
        ("remove_event", {"event_id": "absent"}, "Event to remove"),
        ("set_guest_count", {}, "Event and guest count"),
        ("move_event", {}, "Event and target day"),
        ("reorder_days", {}, "Source and target"),
        ("reorder_days", {"day_number": 5, "target_day_number": 1}, "Selected day"),
        ("update_event", {}, "Updated event id"),
        ("unsupported", {}, "Unsupported event plan"),
    ],
)
def test_invalid_edits_leave_original_plan_unchanged(operation, values, message):
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    before = plan.model_dump()
    with pytest.raises(ValueError, match=message):
        edit_event_plan(plan, load_event_catalog(), TODAY, operation, **values)
    assert plan.model_dump() == before


def test_add_reorder_and_remove_days_rebuild_dates_and_event_links():
    catalog = load_event_catalog()
    plan = build_event_plan(draft_for("three_day_celebration"), catalog, TODAY)
    before = plan.model_dump()
    added, _ = edit_event_plan(plan, catalog, TODAY, "add_day")
    assert len(added.days) == 4
    added, _ = edit_event_plan(
        added,
        catalog,
        TODAY,
        "add_event",
        day_number=4,
        event=PlanEvent(id="new", catalog_id="mehendi"),
    )
    reordered, diff = edit_event_plan(
        added, catalog, TODAY, "reorder_days", day_number=4, target_day_number=1
    )
    assert reordered.days[0].events[0].id == "new"
    assert [day.date for day in reordered.days] == [
        plan.first_event_date + timedelta(days=i) for i in range(4)
    ]
    assert set(diff.affected_task_ids) == {task.id for task in reordered.tasks}
    removed, diff = edit_event_plan(reordered, catalog, TODAY, "remove_day", day_number=1)
    assert all(task.event_id != "new" for task in removed.tasks)
    assert any(task_id.startswith("new:") for task_id in diff.affected_task_ids)
    assert plan.model_dump() == before


def test_day_limits_and_unknown_move_target():
    catalog = load_event_catalog()
    plan = build_event_plan(draft_for("three_day_celebration"), catalog, TODAY)
    event_id = plan.days[0].events[0].id
    with pytest.raises(ValueError, match="Target day"):
        edit_event_plan(plan, catalog, TODAY, "move_event", event_id=event_id, target_day_number=5)
    while len(plan.days) < 5:
        plan, _ = edit_event_plan(plan, catalog, TODAY, "add_day")
    with pytest.raises(ValueError, match="at most five"):
        edit_event_plan(plan, catalog, TODAY, "add_day")
    while len(plan.days) > 1:
        plan, _ = edit_event_plan(plan, catalog, TODAY, "remove_day", day_number=len(plan.days))
    with pytest.raises(ValueError, match="at least one"):
        edit_event_plan(plan, catalog, TODAY, "remove_day", day_number=1)

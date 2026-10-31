import json
from datetime import timedelta
from pathlib import Path

from app.engine.dependency_scheduler import topological_sort_tasks
from app.schemas.plan_state import EventPlan


def test_committed_scenario_outputs_are_valid_event_plans() -> None:
    fixture_path = Path(__file__).resolve().parents[1] / "app" / "fixtures" / "scenario_outputs.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    fixtures = payload["fixtures"]

    assert {fixture["id"] for fixture in fixtures} == {
        "guest_increase",
        "outdoor_venue_loss",
        "date_shift",
    }
    for fixture in fixtures:
        assert fixture["is_saved_fixture"] is True
        plan = EventPlan.model_validate(fixture["updated_plan"])
        assert len(topological_sort_tasks(plan.tasks)) == len(plan.tasks)
        for task in plan.tasks:
            assert task.event_date is not None
            assert task.due_date == task.event_date - timedelta(days=task.lead_time_days or 0)

    venue_loss = next(fixture for fixture in fixtures if fixture["id"] == "outdoor_venue_loss")
    selected_events = [event for day in venue_loss["updated_plan"]["days"] for event in day["events"]]
    assert selected_events[0]["venue_type"] == "indoor"

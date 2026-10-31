import pytest
from pydantic import ValidationError

from app.schemas.plan_state import EventPlan


def base_plan() -> dict[str, object]:
    return {"id": "bounded-plan", "title": "Family celebration", "days": [{"day_number": 1}]}


def test_plan_text_fields_are_bounded_server_side() -> None:
    payload = base_plan()
    payload["notes"] = ["n" * 501]
    with pytest.raises(ValidationError):
        EventPlan.model_validate(payload)


def test_plan_task_list_has_a_server_side_limit() -> None:
    payload = base_plan()
    payload["tasks"] = [{"id": f"task-{index}", "title": "Confirm", "category": "Coordination", "duration_days": 1} for index in range(1001)]
    with pytest.raises(ValidationError):
        EventPlan.model_validate(payload)

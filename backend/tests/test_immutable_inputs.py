import pytest
from pydantic import ValidationError

from app.schemas.intent_delta import PlanDelta
from app.schemas.plan_state import PlanEvent, VendorAssignment


@pytest.mark.parametrize("value,field,next_value", [
    (PlanDelta(guest_count_delta=40), "guest_count_delta", 50),
    (PlanEvent(id="event", catalog_id="sangeet"), "catalog_id", "mehendi"),
    (VendorAssignment(event_id="event", category="venue", place_id="manual:host"), "place_id", "other"),
])
def test_input_value_objects_require_explicit_replacement(value, field, next_value):
    original = value.model_dump_json()
    with pytest.raises(ValidationError):
        setattr(value, field, next_value)
    assert value.model_dump_json() == original
    assert getattr(value.model_copy(update={field: next_value}), field) == next_value

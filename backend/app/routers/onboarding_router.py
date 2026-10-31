from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from ..engine.plan_builder import (
    assign_vendor,
    build_event_plan,
    build_quick_scenario_fixtures,
    edit_event_plan,
)
from ..schemas.plan_state import EventDay, EventPlan, PlanEvent, TimeSlot, VendorAssignment
from ..services.custom_event_mapper import suggest_catalog_event
from ..services.event_catalog import load_event_catalog

router = APIRouter(prefix="/api/plan", tags=["Event Planning"])

EXAMPLE_SELECTIONS: dict[str, tuple[str, list[list[tuple[str, TimeSlot]]]]] = {
    "three_day_celebration": (
        "Mehendi, Sangeet and Pheras over 3 days",
        [[("mehendi", TimeSlot.AFTERNOON)], [("sangeet", TimeSlot.EVENING)], [("pheras", TimeSlot.EVENING)]],
    ),
    "nikah_walima": (
        "Nikah and Walima over 2 days",
        [[("nikah", TimeSlot.MORNING)], [("walima", TimeSlot.EVENING)]],
    ),
    "church_reception": (
        "Church ceremony and reception over 2 days",
        [[("church_ceremony", TimeSlot.MORNING)], [("reception", TimeSlot.EVENING)]],
    ),
    "pooja_special_diets": (
        "Mehendi, Pooja and Pheras with special-diet guests",
        [[("mehendi", TimeSlot.AFTERNOON)], [("pooja", TimeSlot.MORNING)], [("pheras", TimeSlot.EVENING)]],
    ),
}


class EventEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: EventPlan
    operation: Literal["add_day", "remove_day", "add_event", "remove_event", "set_guest_count", "move_event", "reorder_days", "update_event"]
    event_id: str | None = None
    day_number: int | None = Field(default=None, ge=1, le=5)
    target_day_number: int | None = Field(default=None, ge=1, le=5)
    event: PlanEvent | None = None
    guest_count: int | None = Field(default=None, ge=1, le=100_000)


class VendorAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: EventPlan
    assignment: VendorAssignment


class ScenarioFixtureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: EventPlan


class CustomEventMapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=120)


def _today() -> date:
    return date.today()


def _example_days(preset_id: str, catalog: dict[str, Any]) -> list[EventDay]:
    _, selection = EXAMPLE_SELECTIONS[preset_id]
    by_id = {item["id"]: item for item in catalog["events"]}
    return [
        EventDay(
            day_number=day_number,
            events=[
                PlanEvent(
                    id=f"event-{preset_id}-{day_number}-{index}",
                    catalog_id=catalog_id,
                    time_slot=slot,
                )
                for index, (catalog_id, slot) in enumerate(events, start=1)
                if catalog_id in by_id
            ],
        )
        for day_number, events in enumerate(selection, start=1)
    ]


@router.get("/catalog")
async def get_event_catalog() -> dict[str, object]:
    catalog = load_event_catalog()
    # Internal tradition tags are only consumed by the pure inference function.
    public_events = [{key: value for key, value in event.items() if key != "tradition_tags"} for event in catalog["events"]]
    return {
        "notice": catalog["_header"],
        "events": public_events,
        "vendor_categories": ["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"],
    }


@router.get("/examples")
async def get_example_selections() -> list[dict[str, object]]:
    """Return event selections that have passed through the same builder used for final plans."""
    catalog = load_event_catalog()
    today = _today()
    result: list[dict[str, object]] = []
    for preset_id, (title, _) in EXAMPLE_SELECTIONS.items():
        draft = EventPlan(
            id=f"example-{preset_id}", title=title, template="celebration",
            guest_count=1, total_budget_cap_inr=0, per_plate_min_inr=0, per_plate_max_inr=0,
            first_event_date=today + timedelta(days=90),
            days=_example_days(preset_id, catalog),
        )
        built = build_event_plan(draft, catalog, today, allow_incomplete=True)
        result.append({
            "id": preset_id,
            "title": title,
            "days": [
                {
                    "day_number": day.day_number,
                    "events": [event.model_copy(update={"guest_count": None}).model_dump(mode="json") for event in day.events],
                }
                for day in built.days
            ],
            "requires_special_diets": preset_id == "pooja_special_diets",
        })
    return result


@router.post("/map-custom-event")
async def map_custom_event(req: CustomEventMapRequest) -> dict[str, object]:
    return {"suggestion": suggest_catalog_event(req.text)}


@router.post("/build", response_model=EventPlan)
async def build_plan(req: EventPlan) -> EventPlan:
    try:
        return await run_in_threadpool(build_event_plan, req, load_event_catalog(), _today())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/scenarios")
async def get_plan_scenario_fixtures(req: ScenarioFixtureRequest) -> list[dict[str, object]]:
    try:
        return await run_in_threadpool(build_quick_scenario_fixtures, req.plan, load_event_catalog(), _today())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/events/edit")
async def edit_plan_events(req: EventEditRequest) -> dict[str, object]:
    try:
        updated_plan, diff = await run_in_threadpool(edit_event_plan,
            req.plan,
            load_event_catalog(),
            _today(),
            req.operation,
            event_id=req.event_id,
            day_number=req.day_number,
            target_day_number=req.target_day_number,
            event=req.event,
            guest_count=req.guest_count,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"updated_plan": updated_plan, "diff": diff}


@router.post("/vendors/assign")
async def assign_plan_vendor(req: VendorAssignmentRequest) -> dict[str, object]:
    try:
        updated_plan, diff = await run_in_threadpool(assign_vendor, req.plan, load_event_catalog(), _today(), req.assignment)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"updated_plan": updated_plan, "diff": diff}

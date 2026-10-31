"""Representative large plan shared by characterization and profiling."""

from datetime import date

from app.engine.plan_builder import build_event_plan
from app.schemas.plan_state import EventDay, EventPlan, PlanEvent
from app.services.event_catalog import load_event_catalog

TODAY = date(2026, 10, 31)


def generated_plan(events_per_day: int = 10) -> EventPlan:
    draft = EventPlan(
        id="benchmark-plan", title="Generated celebration", guest_count=120,
        total_budget_cap_inr=10_000_000, budget_range_min_inr=8_000_000,
        budget_range_max_inr=10_000_000, per_plate_min_inr=700,
        per_plate_max_inr=1000, city="Pune", first_event_date=date(2027, 5, 1),
        days=[EventDay(day_number=day, events=[
            PlanEvent(id=f"day-{day}-event-{event}", catalog_id="sangeet")
            for event in range(events_per_day)
        ]) for day in range(1, 6)],
    )
    return build_event_plan(draft, load_event_catalog(), TODAY)

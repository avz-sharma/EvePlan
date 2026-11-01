"""Intent field mutations applied in their original precedence order."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from math import isfinite

from ..schemas.intent_delta import PlanDelta
from ..schemas.plan_state import MAX_GUEST_COUNT, EventDay, EventPlan


@dataclass
class EventDelta:
    """Working copy and impact roots for an event-aware intent change."""

    plan: EventPlan
    delta: PlanDelta
    days: list[EventDay]
    candidate: EventPlan
    roots: set[str] = field(default_factory=set)
    categories: set[str] = field(default_factory=set)
    affected_events: set[str] = field(default_factory=set)
    mutated: str = "general"

    @property
    def old_guest_total(self) -> int:
        """Return the original plan count before any intent fields are applied."""
        return self.plan.guest_count

    def apply(self) -> None:
        """Apply intent fields in order; later fields retain summary precedence."""
        delta = self.delta
        if delta.guest_count_delta or delta.guest_count_override is not None:
            self._guest_count()
        if delta.per_plate_delta_inr:
            self._per_plate()
        if delta.days_until_event_delta:
            self._date()
        if delta.venue_capacity_override is not None:
            self._venue()
        if delta.indoor_relocation:
            self._indoor()
        if delta.dietary_jain_delta:
            self._diet()
        if delta.budget_cap_inr_delta:
            self._budget()

    def _guest_count(self) -> None:
        self.mutated = "guest_count"
        self.candidate.guest_count = (
            self.delta.guest_count_override
            if self.delta.guest_count_override is not None
            else max(1, self.old_guest_total + self.delta.guest_count_delta)
        )
        if self.candidate.guest_count > MAX_GUEST_COUNT:
            raise ValueError("Guest count must be between 1 and 100,000.")
        for day in self.days:
            day.events = [
                event.model_copy(update={"guest_count": self.candidate.guest_count})
                if self.delta.guest_count_override is not None
                or event.guest_count is None
                or event.guest_count == self.old_guest_total
                else event
                for event in day.events
            ]
        self.affected_events = {
            event.id
            for day in self.days
            for event in day.events
            if event.guest_count == self.candidate.guest_count
        }
        self.roots.update((f"{event_id}:catering_menu_lock" for event_id in self.affected_events))
        self.categories.update({"Catering", "Venue"})

    def _per_plate(self) -> None:
        self.mutated = "per_plate_rate"
        self.candidate.per_plate_min_inr = max(
            1.0, self.plan.per_plate_min_inr + self.delta.per_plate_delta_inr
        )
        self.candidate.per_plate_max_inr = max(
            self.candidate.per_plate_min_inr,
            self.plan.per_plate_max_inr + self.delta.per_plate_delta_inr,
        )
        self.categories.add("Catering")
        self.roots.update(
            (task.id for task in self.plan.tasks if task.budget_category == "Catering")
        )

    def _date(self) -> None:
        self.mutated = "timeline_days"
        self.candidate.first_event_date = self._first_date() + timedelta(
            days=self.delta.days_until_event_delta
        )
        self.roots.update((task.id for task in self.plan.tasks))

    def _venue(self) -> None:
        assert self.delta.venue_capacity_override is not None
        self.mutated = "venue_capacity"
        self.candidate.venue_capacity = max(1, self.delta.venue_capacity_override)
        self.categories.add("Venue")
        self.roots.update((task.id for task in self.plan.tasks if task.budget_category == "Venue"))

    def _indoor(self) -> None:
        outdoor = next(
            (
                (day.day_number, event)
                for day in self.days
                for event in day.events
                if (event.venue_type or "").casefold() in {"outdoor", "garden", "lawn"}
            ),
            None,
        )
        if outdoor is not None:
            self.mutated = "weather_indoor_move"
            _, target = outdoor
            for day in self.days:
                day.events = [
                    event.model_copy(update={"venue_type": "indoor"})
                    if event.id == target.id
                    else event
                    for event in day.events
                ]
            self.affected_events.add(target.id)
            self.roots.update((task.id for task in self.plan.tasks if task.event_id == target.id))
            self.categories.update({"Venue", "Decor"})

    def _diet(self) -> None:
        self.mutated = "special_diets"
        jain_count = max(0, self.plan.special_diets.get("jain", 0) + self.delta.dietary_jain_delta)
        if jain_count > self.candidate.guest_count:
            raise ValueError("Special-diet counts cannot exceed the total guest count")
        self.candidate.special_diets = {**self.plan.special_diets, "jain": jain_count}
        self.categories.add("Catering")
        self.roots.update(
            (task.id for task in self.plan.tasks if task.budget_category == "Catering")
        )

    def _budget(self) -> None:
        self.mutated = "budget_cap"
        new_cap = max(1.0, self.plan.total_budget_cap_inr + self.delta.budget_cap_inr_delta)
        if not isfinite(new_cap):
            raise ValueError("Budget is outside the supported numeric range")
        self.candidate.total_budget_cap_inr = new_cap
        self.candidate.budget_range_max_inr = new_cap
        self.candidate.budget_range_min_inr = min(self.plan.budget_range_min_inr, new_cap)

    def _first_date(self) -> date:
        assert self.plan.first_event_date is not None
        return self.plan.first_event_date

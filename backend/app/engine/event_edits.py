"""Validated day-list mutations; rebuilding derived state belongs to event_operations."""

from dataclasses import dataclass

from ..schemas.plan_state import EventDay, EventPlan, PlanEvent

MAX_CELEBRATION_DAYS = 5


@dataclass
class EventEdit:
    """One edit and its copied working days; the input plan is never mutated."""

    plan: EventPlan
    days: list[EventDay]
    event_id: str | None = None
    day_number: int | None = None
    event: PlanEvent | None = None
    guest_count: int | None = None
    target_day_number: int | None = None

    def apply(self, operation: str) -> tuple[set[str], set[str]]:
        """Return affected root task IDs and budget categories for one supported edit."""
        handlers = {
            "add_event": self._add_event,
            "add_day": self._add_day,
            "remove_day": self._remove_day,
            "remove_event": self._remove_event,
            "set_guest_count": self._set_guest_count,
            "move_event": self._move_event,
            "reorder_days": self._reorder_days,
            "update_event": self._update_event,
        }
        if operation not in handlers:
            raise ValueError(f"Unsupported event plan operation: {operation}")
        return handlers[operation]()

    def _event_exists(self) -> bool:
        return any(event.id == self.event_id for day in self.days for event in day.events)

    def _task_ids(self) -> set[str]:
        return {task.id for task in self.plan.tasks if task.event_id == self.event_id}

    def _renumber(self) -> None:
        for ordinal, day in enumerate(self.days, start=1):
            day.day_number = ordinal

    def _add_event(self) -> tuple[set[str], set[str]]:
        event = self.event
        if event is None or self.day_number is None:
            raise ValueError("Event and day are required to add an event")
        day = next((item for item in self.days if item.day_number == self.day_number), None)
        if day is None:
            raise ValueError("Selected day does not exist")
        day.events.append(
            event.model_copy(update={"guest_count": event.guest_count or self.plan.guest_count})
        )
        return {f"{event.id}:venue_booking", f"{event.id}:catering_menu_lock"}, {
            category.value for category in event.vendor_categories
        }

    def _add_day(self) -> tuple[set[str], set[str]]:
        if len(self.days) >= MAX_CELEBRATION_DAYS:
            raise ValueError("A celebration can have at most five days")
        self.days.append(EventDay(day_number=len(self.days) + 1, events=[]))
        return set(), set()

    def _remove_day(self) -> tuple[set[str], set[str]]:
        if self.day_number is None or not 1 <= self.day_number <= len(self.days):
            raise ValueError("Selected day does not exist")
        if len(self.days) == 1:
            raise ValueError("A plan must keep at least one day")
        removed = {event.id for event in self.days[self.day_number - 1].events}
        roots = {task.id for task in self.plan.tasks if task.event_id in removed}
        self.days.pop(self.day_number - 1)
        self._renumber()
        return roots, set()

    def _remove_event(self) -> tuple[set[str], set[str]]:
        if self.event_id is None or not self._event_exists():
            raise ValueError("Event to remove was not found")
        for day in self.days:
            day.events = [event for event in day.events if event.id != self.event_id]
        return self._task_ids(), set()

    def _set_guest_count(self) -> tuple[set[str], set[str]]:
        if self.event_id is None or self.guest_count is None or not self._event_exists():
            raise ValueError("Event and guest count are required")
        for day in self.days:
            day.events = [
                event.model_copy(update={"guest_count": self.guest_count})
                if event.id == self.event_id
                else event
                for event in day.events
            ]
        return {f"{self.event_id}:catering_menu_lock"}, {"Venue", "Catering"}

    def _move_event(self) -> tuple[set[str], set[str]]:
        if self.event_id is None or self.target_day_number is None or not self._event_exists():
            raise ValueError("Event and target day are required")
        source = next(
            day for day in self.days if any(event.id == self.event_id for event in day.events)
        )
        target = next((day for day in self.days if day.day_number == self.target_day_number), None)
        if target is None:
            raise ValueError("Target day does not exist")
        event = next(event for event in source.events if event.id == self.event_id)
        source.events.remove(event)
        target.events.append(event)
        return self._task_ids(), set()

    def _reorder_days(self) -> tuple[set[str], set[str]]:
        if self.day_number is None or self.target_day_number is None:
            raise ValueError("Source and target day numbers are required")
        source, target = self.day_number - 1, self.target_day_number - 1
        if not (0 <= source < len(self.days) and 0 <= target < len(self.days)):
            raise ValueError("Selected day does not exist")
        self.days.insert(target, self.days.pop(source))
        self._renumber()
        return {task.id for task in self.plan.tasks}, set()

    def _update_event(self) -> tuple[set[str], set[str]]:
        event = self.event
        if (
            self.event_id is None
            or event is None
            or not self._event_exists()
            or event.id != self.event_id
        ):
            raise ValueError("Updated event id does not match an existing event")
        for day in self.days:
            day.events = [event if item.id == self.event_id else item for item in day.events]
        roots = self._task_ids() | {
            f"{self.event_id}:venue_booking",
            f"{self.event_id}:catering_menu_lock",
        }
        return roots, {category.value for category in event.vendor_categories}

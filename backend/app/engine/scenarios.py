"""Example scenarios derived from the current host plan."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Mapping

from ..schemas.intent_delta import CascadeDiff
from ..schemas.plan_state import (
    EventPlan,
)
from .event_metadata import (
    event_metadata,
    index_catalog,
)
from .event_operations import edit_event_plan
from .plan_builder import build_event_plan
from .planning_heuristics import GUEST_SURGE_SCENARIO_SHARE


def build_quick_scenario_fixtures(
    plan: EventPlan,
    catalog: Mapping[str, Any],
    today: date,
) -> list[dict[str, Any]]:
    """Create validated example outcomes relative to the user's current plan."""
    fixtures: list[dict[str, Any]] = []
    events = [(day.day_number, event) for day in plan.days for event in day.events]
    if events:
        _, target = max(events, key=lambda row: row[1].guest_count or plan.guest_count)
        increase = max(1, round(plan.guest_count * GUEST_SURGE_SCENARIO_SHARE))
        expanded = plan.model_copy(update={"guest_count": plan.guest_count + increase})
        updated, diff = edit_event_plan(
            expanded,
            catalog,
            today,
            "set_guest_count",
            event_id=target.id,
            guest_count=(target.guest_count or plan.guest_count) + increase,
        )
        fixtures.append(
            {
                "id": "guest_increase",
                "title": f"Add {increase} guests to {target.custom_name or event_metadata(target, catalog, index_catalog(catalog))['display_name']}",
                "description": "Uses the per-plate range you entered and updates this event's venue fit.",
                "updated_plan": updated,
                "diff": diff,
                "is_saved_fixture": True,
            }
        )

    outdoor = next(
        (
            event
            for _, event in events
            if (event.venue_type or "").casefold() in {"outdoor", "garden", "lawn"}
        ),
        None,
    )
    if outdoor is not None:
        updated, diff = edit_event_plan(
            plan,
            catalog,
            today,
            "update_event",
            event_id=outdoor.id,
            event=outdoor.model_copy(update={"venue_type": "indoor"}),
        )
        fixtures.append(
            {
                "id": "outdoor_venue_loss",
                "title": f"Move {outdoor.custom_name or event_metadata(outdoor, catalog, index_catalog(catalog))['display_name']} indoors",
                "description": "Applies only because this event is marked as an outdoor venue.",
                "updated_plan": updated,
                "diff": diff,
                "is_saved_fixture": True,
            }
        )

    if plan.first_event_date is not None:
        shifted = plan.model_copy(
            update={"first_event_date": plan.first_event_date - timedelta(days=14)}
        )
        updated = build_event_plan(shifted, catalog, today)
        task_ids = {task.id for task in plan.tasks}
        hops = {task_id: 0 for task_id in task_ids}
        fixtures.append(
            {
                "id": "date_shift",
                "title": "Move the first event two weeks earlier",
                "description": "Recalculates every event-relative task date across all days.",
                "updated_plan": updated,
                "diff": CascadeDiff(
                    mutated_attribute="first_event_date",
                    affected_task_ids=sorted(task_ids),
                    affected_budget_categories=[],
                    node_hops=hops,
                    summary="Shifted the first event date and rebuilt all event-relative task dates.",
                ),
                "is_saved_fixture": True,
            }
        )
    return fixtures

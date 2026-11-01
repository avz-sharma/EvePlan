"""Catalog lookups and event-derived host hints."""

from __future__ import annotations

from typing import Mapping

from ..schemas.catalog import EventCatalog, EventCatalogEntry
from ..schemas.plan_state import (
    EventPlan,
    PlanEvent,
)

VENDOR_CATEGORY_LABELS = {
    "venue": "Venue",
    "caterer": "Catering",
    "decorator": "Decor",
    "photographer": "Photography",
    "makeup": "Makeup",
    "music": "Music",
    "transport": "Transport",
}


def index_catalog(catalog: EventCatalog) -> dict[str, EventCatalogEntry]:
    return {str(item["id"]): item.copy() for item in catalog.get("events", [])}


def event_metadata(
    event: PlanEvent, catalog: EventCatalog, index: Mapping[str, EventCatalogEntry]
) -> EventCatalogEntry:
    if event.catalog_id:
        if event.catalog_id not in index:
            raise ValueError(f"Unknown catalog event: {event.catalog_id}")
        return index[event.catalog_id]
    return {
        "id": "custom",
        "display_name": event.custom_name or "Custom event",
        "typical_duration_minutes": 120,
        "time_of_day": event.time_slot.value,
        "venue_type_hints": [],
        "vendor_categories_needed": [item.value for item in event.vendor_categories],
        "guest_count_sensitivity": "host-defined",
        "tradition_tags": [],
        "task_templates": catalog.get("custom_event_defaults", {}).get("task_templates", []),
    }


def build_hints(
    plan: EventPlan, catalog: EventCatalog, index: Mapping[str, EventCatalogEntry]
) -> dict[str, list[str]]:
    tags = {
        tag
        for day in plan.days
        for event in day.events
        for tag in event_metadata(event, catalog, index).get("tradition_tags", [])
    }
    event_names = [
        event_metadata(event, catalog, index)["display_name"]
        for day in plan.days
        for event in day.events
    ]
    city = plan.city.strip()
    categories = sorted(
        {
            category
            for day in plan.days
            for event in day.events
            for category in event_metadata(event, catalog, index).get(
                "vendor_categories_needed", []
            )
        }
    )

    food_defaults = [
        "Ask the host to confirm meal preferences and counts; do not infer diet counts."
    ]
    if "nikah_context" in tags or "walima_context" in tags:
        food_defaults.append(
            "Ask whether halal meals are requested; use the host's count if provided."
        )
    if plan.special_diets:
        food_defaults.append(
            "Use the special-diet counts entered by the host when briefing caterers."
        )

    wording = ["Use the event names and wording selected by the host."]
    if "confirm_host_wording" in tags:
        wording.append(
            "Confirm the host's preferred ceremony wording before drafting vendor briefs."
        )

    search_terms: list[str] = []
    for category in categories:
        label = VENDOR_CATEGORY_LABELS.get(category, category)
        for name in event_names:
            search_terms.append(" ".join(part for part in (label, name, city) if part))
    if "nikah_context" in tags or "walima_context" in tags:
        search_terms.extend(
            " ".join(part for part in ("halal-friendly caterer", city) if part) for _ in [0]
        )
    return {
        "food_defaults": list(dict.fromkeys(food_defaults)),
        "wording": list(dict.fromkeys(wording)),
        "vendor_search_terms": list(dict.fromkeys(search_terms)),
    }

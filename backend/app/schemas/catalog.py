"""Static catalog shapes passed into the pure engine; loading stays in services."""

from typing import NotRequired, TypedDict


class TaskTemplate(TypedDict):
    """Event-relative task defaults, including optional vendor and duration hints."""

    id: str
    name: str
    lead_time_days: int
    duration_days: NotRequired[int]
    dependencies: list[str]
    budget_category: str
    vendor_category: NotRequired[str]


class EventCatalogEntry(TypedDict):
    """Reviewed starter metadata for one event, without host-specific state."""

    id: str
    display_name: str
    typical_duration_minutes: int
    time_of_day: str
    venue_type_hints: list[str]
    vendor_categories_needed: list[str]
    guest_count_sensitivity: str
    tradition_tags: list[str]
    task_templates: list[TaskTemplate]


class CustomEventDefaults(TypedDict):
    """Task templates filtered by the host's custom-event vendor choices."""

    task_templates: list[TaskTemplate]


class EventCatalog(TypedDict):
    """Catalog document consumed by plan builders and example selections."""

    _header: str
    events: list[EventCatalogEntry]
    custom_event_defaults: CustomEventDefaults

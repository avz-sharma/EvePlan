"""Event-relative task construction and dependency validation."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Mapping

from ..schemas.catalog import EventCatalog, EventCatalogEntry, TaskTemplate
from ..schemas.plan_state import (
    EventPlan,
    PlanEvent,
    TaskNode,
)
from .dependency_scheduler import compute_cpm_schedule
from .event_metadata import event_metadata


def build_tasks(
    plan: EventPlan, catalog: EventCatalog, index: Mapping[str, EventCatalogEntry]
) -> list[TaskNode]:
    """Resolve event-relative task templates and reject impossible prerequisite dates."""
    event_context: dict[str, tuple[PlanEvent, date, EventCatalogEntry]] = {}
    templates_by_event: dict[str, list[TaskTemplate]] = {}
    for day in plan.days:
        event_date = day.date
        if event_date is None:
            raise ValueError(f"Day {day.day_number} is missing a date")
        for event in day.events:
            if event.guest_count is None:
                raise ValueError(f"Event {event.id} must have a resolved guest count")
            if event.guest_count > plan.guest_count:
                raise ValueError(f"Event {event.id} guest count cannot exceed the plan total")
            metadata = event_metadata(event, catalog, index)
            event_context[event.id] = (event, event_date, metadata)
            templates = list(metadata.get("task_templates", []))
            if event.catalog_id is None:
                selected = {category.value for category in event.vendor_categories}
                templates = [
                    template
                    for template in templates
                    if template.get("vendor_category") in selected
                ]
                templates.append(
                    {
                        "id": "event_brief",
                        "name": f"Confirm requirements for {event.custom_name}",
                        "lead_time_days": 14,
                        "duration_days": 1,
                        "dependencies": [],
                        "budget_category": "Coordination",
                    }
                )
            templates_by_event[event.id] = templates

    task_ids: dict[tuple[str, str], str] = {
        (event_id, template["id"]): f"{event_id}:{template['id']}"
        for event_id, templates in templates_by_event.items()
        for template in templates
    }
    records: list[TaskNode] = []
    date_by_task: dict[str, date] = {}
    duration_by_task: dict[str, int] = {}
    for event_id, templates in templates_by_event.items():
        event, event_date, metadata = event_context[event_id]
        for template in templates:
            task_id = task_ids[(event_id, template["id"])]
            dependencies: list[str] = []
            for dependency in template.get("dependencies", []):
                if dependency.startswith("all:"):
                    dependency_id = dependency.removeprefix("all:")
                    dependencies.extend(
                        task_ids[(source_event_id, dependency_id)]
                        for source_event_id in event_context
                        if (source_event_id, dependency_id) in task_ids
                    )
                elif (event_id, dependency) in task_ids:
                    dependencies.append(task_ids[(event_id, dependency)])
            lead_days = int(template["lead_time_days"])
            due_date = event_date - timedelta(days=lead_days)
            category = str(template.get("budget_category", "Coordination"))
            records.append(
                TaskNode(
                    id=task_id,
                    title=str(template["name"]),
                    category=category,
                    event_id=event_id,
                    event_name=str(metadata["display_name"]),
                    event_date=event_date,
                    due_date=due_date,
                    lead_time_days=lead_days,
                    budget_category=category,
                    duration_days=int(template.get("duration_days", 1)),
                    dependencies=list(dict.fromkeys(dependencies)),
                )
            )
            date_by_task[task_id] = due_date
            duration_by_task[task_id] = int(template.get("duration_days", 1))

    task_ids_set = {task.id for task in records}
    for task in records:
        missing = [dep for dep in task.dependencies if dep not in task_ids_set]
        if missing:
            raise ValueError(f"Task {task.id} has missing dependencies: {missing}")
        late_dependencies = [
            dep
            for dep in task.dependencies
            if date_by_task[dep] + timedelta(days=duration_by_task[dep]) > date_by_task[task.id]
        ]
        if late_dependencies:
            raise ValueError(
                f"Task {task.id} has dependencies that miss its lead-time date: {late_dependencies}"
            )
    return compute_cpm_schedule(records)

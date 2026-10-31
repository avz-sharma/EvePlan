"""Pure event-plan construction and cascade operations.

Catalog I/O belongs to the API boundary. Every function here receives the already
loaded catalog so plan creation and mutations remain deterministic and testable.
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import date, timedelta
from typing import Any, Mapping

from ..schemas.intent_delta import CascadeDiff
from ..schemas.plan_state import (
    BudgetBucket,
    EventDay,
    EventPlan,
    PlanEvent,
    TaskNode,
    VendorAssignment,
)
from .dependency_scheduler import compute_cpm_schedule
from .planning_heuristics import CONTINGENCY_RATE, GUEST_SURGE_SCENARIO_SHARE

VENDOR_CATEGORY_LABELS = {
    "venue": "Venue",
    "caterer": "Catering",
    "decorator": "Decor",
    "photographer": "Photography",
    "makeup": "Makeup",
    "music": "Music",
    "transport": "Transport",
}


def _index_catalog(catalog: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item["id"]): dict(item) for item in catalog.get("events", [])}


def _metadata(event: PlanEvent, catalog: Mapping[str, Any], index: Mapping[str, dict[str, Any]]) -> dict[str, Any]:
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


def _build_hints(plan: EventPlan, catalog: Mapping[str, Any], index: Mapping[str, dict[str, Any]]) -> dict[str, list[str]]:
    tags = {
        tag
        for day in plan.days
        for event in day.events
        for tag in _metadata(event, catalog, index).get("tradition_tags", [])
    }
    event_names = [
        _metadata(event, catalog, index)["display_name"]
        for day in plan.days for event in day.events
    ]
    city = plan.city.strip()
    categories = sorted({
        category
        for day in plan.days
        for event in day.events
        for category in _metadata(event, catalog, index).get("vendor_categories_needed", [])
    })

    food_defaults = ["Ask the host to confirm meal preferences and counts; do not infer diet counts."]
    if "nikah_context" in tags or "walima_context" in tags:
        food_defaults.append("Ask whether halal meals are requested; use the host's count if provided.")
    if plan.special_diets:
        food_defaults.append("Use the special-diet counts entered by the host when briefing caterers.")

    wording = ["Use the event names and wording selected by the host."]
    if "confirm_host_wording" in tags:
        wording.append("Confirm the host's preferred ceremony wording before drafting vendor briefs.")

    search_terms: list[str] = []
    for category in categories:
        label = VENDOR_CATEGORY_LABELS.get(category, category)
        for name in event_names:
            search_terms.append(" ".join(part for part in (label, name, city) if part))
    if "nikah_context" in tags or "walima_context" in tags:
        search_terms.extend(" ".join(part for part in ("halal-friendly caterer", city) if part) for _ in [0])
    return {
        "food_defaults": list(dict.fromkeys(food_defaults)),
        "wording": list(dict.fromkeys(wording)),
        "vendor_search_terms": list(dict.fromkeys(search_terms)),
    }


def _build_tasks(plan: EventPlan, catalog: Mapping[str, Any], index: Mapping[str, dict[str, Any]]) -> list[TaskNode]:
    event_context: dict[str, tuple[PlanEvent, date, dict[str, Any]]] = {}
    templates_by_event: dict[str, list[dict[str, Any]]] = {}
    for day in plan.days:
        event_date = day.date
        if event_date is None:
            raise ValueError(f"Day {day.day_number} is missing a date")
        for event in day.events:
            if event.guest_count is None:
                raise ValueError(f"Event {event.id} must have a resolved guest count")
            if event.guest_count > plan.guest_count:
                raise ValueError(f"Event {event.id} guest count cannot exceed the plan total")
            metadata = _metadata(event, catalog, index)
            event_context[event.id] = (event, event_date, metadata)
            templates = list(metadata.get("task_templates", []))
            if event.catalog_id is None:
                selected = {category.value for category in event.vendor_categories}
                templates = [
                    template for template in templates
                    if template.get("vendor_category") in selected
                ]
                templates.append({
                    "id": "event_brief", "name": f"Confirm requirements for {event.custom_name}",
                    "lead_time_days": 14, "duration_days": 1, "dependencies": [],
                    "budget_category": "Coordination",
                })
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
            records.append(TaskNode(
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
            ))
            date_by_task[task_id] = due_date
            duration_by_task[task_id] = int(template.get("duration_days", 1))

    task_ids_set = {task.id for task in records}
    for task in records:
        missing = [dep for dep in task.dependencies if dep not in task_ids_set]
        if missing:
            raise ValueError(f"Task {task.id} has missing dependencies: {missing}")
        late_dependencies = [
            dep for dep in task.dependencies
            if date_by_task[dep] + timedelta(days=duration_by_task[dep]) > date_by_task[task.id]
        ]
        if late_dependencies:
            raise ValueError(f"Task {task.id} has dependencies that miss its lead-time date: {late_dependencies}")
    return compute_cpm_schedule(records)


def _build_budgets(plan: EventPlan, catalog: Mapping[str, Any], index: Mapping[str, dict[str, Any]]) -> list[BudgetBucket]:
    guest_counts: dict[str, int] = defaultdict(int)
    categories: set[str] = set()
    for day in plan.days:
        for event in day.events:
            metadata = _metadata(event, catalog, index)
            categories.update(metadata.get("vendor_categories_needed", []))
            categories.update(category.value for category in event.vendor_categories)
            guest_counts[event.id] = event.guest_count or plan.guest_count
    categories.update(assignment.category.value for assignment in plan.vendor_assignments)

    quotes: dict[str, float] = defaultdict(float)
    quoted_events: dict[str, set[str]] = defaultdict(set)
    category_caps: dict[str, float] = defaultdict(float)
    categories_with_caps: set[str] = set()
    for assignment in plan.vendor_assignments:
        if assignment.quoted_total_inr is not None:
            quotes[assignment.category.value] += assignment.quoted_total_inr
            quoted_events[assignment.category.value].add(assignment.event_id)
        if assignment.category_budget_cap_inr is not None:
            category_caps[assignment.category.value] += assignment.category_budget_cap_inr
            categories_with_caps.add(assignment.category.value)

    if "caterer" in categories:
        unquoted_guest_total = sum(
            count for event_id, count in guest_counts.items()
            if event_id not in quoted_events.get("caterer", set())
        )
        catering_min = quotes.get("caterer", 0.0) + unquoted_guest_total * plan.per_plate_min_inr
        catering_max = quotes.get("caterer", 0.0) + unquoted_guest_total * plan.per_plate_max_inr
        category_values = {"caterer": (catering_min, catering_max)}
    else:
        category_values = {}

    for category, quote in quotes.items():
        if category != "caterer":
            category_values[category] = (quote, quote)

    result: list[BudgetBucket] = []
    for category in sorted(categories):
        label = VENDOR_CATEGORY_LABELS.get(category, category.title())
        minimum, maximum = category_values.get(category, (0.0, 0.0))
        assumptions = ["Based on user-entered per-plate range and event guest counts."] if category == "caterer" else []
        if category in quotes and category != "caterer":
            assumptions = ["Based on the user's entered vendor quote."]
        elif category != "caterer":
            assumptions = ["No user-entered quote; amount is not estimated."]
        if category == "caterer" and plan.per_plate_max_inr <= 0 and not quotes.get(category):
            assumptions = ["No per-plate budget or quote entered; amount is not estimated."]
        contingency = round(maximum * CONTINGENCY_RATE, 2)
        category_cap = category_caps[category] if category in categories_with_caps else None
        result.append(BudgetBucket(
            category=label,
            allocated_min_inr=round(minimum, 2),
            allocated_max_inr=round(maximum, 2),
            contingency_inr=contingency,
            assumptions=assumptions,
            category_budget_cap_inr=category_cap,
            is_violated=category_cap is not None and maximum > category_cap,
        ))
    projected = sum(item.allocated_max_inr + item.contingency_inr for item in result)
    if plan.total_budget_cap_inr > 0 and projected > plan.total_budget_cap_inr:
        for bucket in result:
            if bucket.allocated_max_inr > 0:
                bucket.is_violated = True
    return result


def build_event_plan(
    plan: EventPlan,
    catalog: Mapping[str, Any],
    today: date,
    *,
    allow_incomplete: bool = False,
) -> EventPlan:
    """Resolve the onboarding draft into an event-aware plan, task DAG, and budgets."""
    if plan.first_event_date is None:
        raise ValueError("First event date is required")
    if not plan.days:
        raise ValueError("At least one celebration day is required")
    if plan.total_budget_cap_inr <= 0 and not allow_incomplete:
        raise ValueError("Total budget is required")
    if (plan.budget_range_min_inr <= 0 or plan.budget_range_max_inr <= 0) and not allow_incomplete:
        raise ValueError("Total budget range is required")
    if (plan.per_plate_min_inr <= 0 or plan.per_plate_max_inr <= 0) and not allow_incomplete:
        raise ValueError("Per-plate budget range is required")
    if plan.per_plate_min_inr > plan.per_plate_max_inr and plan.per_plate_max_inr > 0:
        raise ValueError("Minimum per-plate budget cannot exceed maximum")

    days = sorted(plan.days, key=lambda item: item.day_number)
    for index, day in enumerate(days):
        if day.day_number != index + 1:
            raise ValueError("Day numbers must be consecutive, starting at 1")
        event_date = plan.first_event_date + timedelta(days=index)
        events: list[PlanEvent] = []
        for event in day.events:
            count = plan.guest_count if event.guest_count is None else event.guest_count
            events.append(event.model_copy(update={"guest_count": count}))
        days[index] = day.model_copy(update={"date": event_date, "events": events})

    resolved = plan.model_copy(update={
        "days": days,
        "total_budget_cap_inr": plan.budget_range_max_inr or plan.total_budget_cap_inr,
    })
    index = _index_catalog(catalog)
    prior_status = {task.id: task.status for task in plan.tasks}
    resolved.profile_hints = _build_hints(resolved, catalog, index)
    tasks = _build_tasks(resolved, catalog, index)
    assigned_categories = {
        (assignment.event_id, VENDOR_CATEGORY_LABELS[assignment.category.value])
        for assignment in resolved.vendor_assignments
    }
    resolved.tasks = [
        task.model_copy(update={
            "status": (
                "COMPLETED" if prior_status.get(task.id) == "COMPLETED"
                else "IN_PROGRESS" if (task.event_id, task.budget_category) in assigned_categories
                else prior_status.get(task.id, "PENDING")
            )
        })
        for task in tasks
    ]
    resolved.budget_buckets = _build_budgets(resolved, catalog, index)
    resolved.days_until_event = max(0, (plan.first_event_date - today).days)
    resolved.dietary_split = resolved.dietary_split.model_copy(update={
        "regular": max(0, plan.guest_count - sum(plan.special_diets.values())),
        "jain": plan.special_diets.get("jain", 0),
        "vegan": plan.special_diets.get("vegan", 0),
    })
    resolved.accessibility = resolved.accessibility.model_copy(update={"elderly_count": plan.elder_members})
    return resolved


def _dependent_hops(tasks: list[TaskNode], roots: set[str]) -> dict[str, int]:
    successors: dict[str, list[str]] = defaultdict(list)
    task_ids = {task.id for task in tasks}
    for task in tasks:
        for dependency in task.dependencies:
            successors[dependency].append(task.id)
    hops: dict[str, int] = {}
    queue = deque((root, 0) for root in roots)
    while queue:
        task_id, hop = queue.popleft()
        if task_id in hops and hops[task_id] <= hop:
            continue
        hops[task_id] = hop
        if task_id in task_ids:
            for successor in successors[task_id]:
                queue.append((successor, hop + 1))
    return hops


def edit_event_plan(
    plan: EventPlan,
    catalog: Mapping[str, Any],
    today: date,
    operation: str,
    *,
    event_id: str | None = None,
    day_number: int | None = None,
    event: PlanEvent | None = None,
    guest_count: int | None = None,
    target_day_number: int | None = None,
) -> tuple[EventPlan, CascadeDiff]:
    """Apply one event/day edit and rebuild dependent dates, budgets, hints, and tasks."""
    days = [day.model_copy(deep=True) for day in plan.days]
    old_event_day = next(((day.day_number, event) for day in days for event in day.events if event.id == event_id), None)
    old_task_ids = {task.id for task in plan.tasks if task.event_id == event_id}
    affected_categories: set[str] = set()
    roots: set[str] = set()
    mutated = operation

    if operation == "add_event":
        if event is None or day_number is None:
            raise ValueError("Event and day are required to add an event")
        day = next((item for item in days if item.day_number == day_number), None)
        if day is None:
            raise ValueError("Selected day does not exist")
        day.events.append(event.model_copy(update={"guest_count": event.guest_count or plan.guest_count}))
        roots = {f"{event.id}:venue_booking", f"{event.id}:catering_menu_lock"}
        affected_categories.update(category.value for category in event.vendor_categories)
    elif operation == "add_day":
        if len(days) >= 5:
            raise ValueError("A celebration can have at most five days")
        days.append(EventDay(day_number=len(days) + 1, events=[]))
        roots = set()
    elif operation == "remove_day":
        if day_number is None or not 1 <= day_number <= len(days):
            raise ValueError("Selected day does not exist")
        if len(days) == 1:
            raise ValueError("A plan must keep at least one day")
        removed_event_ids = {item.id for item in days[day_number - 1].events}
        roots = {task.id for task in plan.tasks if task.event_id in removed_event_ids}
        days.pop(day_number - 1)
        for ordinal, day in enumerate(days, start=1):
            day.day_number = ordinal
    elif operation == "remove_event":
        if event_id is None or old_event_day is None:
            raise ValueError("Event to remove was not found")
        for day in days:
            day.events = [item for item in day.events if item.id != event_id]
        roots = old_task_ids
    elif operation == "set_guest_count":
        if event_id is None or guest_count is None or old_event_day is None:
            raise ValueError("Event and guest count are required")
        for day in days:
            day.events = [item.model_copy(update={"guest_count": guest_count}) if item.id == event_id else item for item in day.events]
        roots = {f"{event_id}:catering_menu_lock"}
        affected_categories.update({"Venue", "Catering"})
    elif operation == "move_event":
        if event_id is None or target_day_number is None or old_event_day is None:
            raise ValueError("Event and target day are required")
        source = next(day for day in days if any(item.id == event_id for item in day.events))
        target = next((day for day in days if day.day_number == target_day_number), None)
        if target is None:
            raise ValueError("Target day does not exist")
        item = next(item for item in source.events if item.id == event_id)
        source.events.remove(item)
        target.events.append(item)
        roots = old_task_ids
    elif operation == "reorder_days":
        if day_number is None or target_day_number is None:
            raise ValueError("Source and target day numbers are required")
        source_index, target_index = day_number - 1, target_day_number - 1
        if not (0 <= source_index < len(days) and 0 <= target_index < len(days)):
            raise ValueError("Selected day does not exist")
        days.insert(target_index, days.pop(source_index))
        for ordinal, day in enumerate(days, start=1):
            day.day_number = ordinal
        roots = {task.id for task in plan.tasks}
    elif operation == "update_event":
        if event_id is None or event is None or old_event_day is None or event.id != event_id:
            raise ValueError("Updated event id does not match an existing event")
        for day in days:
            day.events = [event if item.id == event_id else item for item in day.events]
        roots = old_task_ids | {f"{event_id}:venue_booking", f"{event_id}:catering_menu_lock"}
        affected_categories.update(category.value for category in event.vendor_categories)
    else:
        raise ValueError(f"Unsupported event plan operation: {operation}")

    remaining_event_ids = {event.id for day in days for event in day.events}
    candidate = plan.model_copy(update={
        "days": days,
        "vendor_assignments": [assignment for assignment in plan.vendor_assignments if assignment.event_id in remaining_event_ids],
    })
    rebuilt = build_event_plan(candidate, catalog, today)
    removed_ids = old_task_ids
    if operation == "remove_day":
        surviving_ids = {event.id for day in rebuilt.days for event in day.events}
        removed_ids = {task.id for task in plan.tasks if task.event_id not in surviving_ids}
    old_hops = _dependent_hops(plan.tasks, removed_ids) if operation in {"remove_event", "remove_day"} else {}
    hops = _dependent_hops(rebuilt.tasks, roots)
    if old_hops:
        for task_id, hop in old_hops.items():
            hops.setdefault(task_id, hop)
    affected = set(hops)
    changed_budgets = {
        before.category for before in plan.budget_buckets
        if next((after for after in rebuilt.budget_buckets if after.category == before.category), None) != before
    } | {
        after.category for after in rebuilt.budget_buckets
        if next((before for before in plan.budget_buckets if before.category == after.category), None) != after
    }
    summary = f"{operation.replace('_', ' ').capitalize()} updated {len(affected)} dependent task(s) across {len(rebuilt.days)} day(s)."
    diff = CascadeDiff(
        mutated_attribute=mutated,
        affected_task_ids=sorted(affected),
        affected_budget_categories=sorted(affected_categories | changed_budgets),
        node_hops=hops,
        violations=[
            f"{assignment.category.value} vendor capacity ({assignment.capacity}) is below event attendance ({next((item.guest_count for day in rebuilt.days for item in day.events if item.id == assignment.event_id), 0)})."
            for assignment in rebuilt.vendor_assignments
            if assignment.capacity is not None and assignment.capacity < next((item.guest_count for day in rebuilt.days for item in day.events if item.id == assignment.event_id), 0)
        ],
        summary=summary,
    )
    return rebuilt, diff


def assign_vendor(
    plan: EventPlan,
    catalog: Mapping[str, Any],
    today: date,
    assignment: VendorAssignment,
) -> tuple[EventPlan, CascadeDiff]:
    """Replace the vendor for one event/category and re-evaluate its plan branch."""
    if not any(event.id == assignment.event_id for day in plan.days for event in day.events):
        raise ValueError("Vendor assignment event was not found")
    assignments = [
        item for item in plan.vendor_assignments
        if not (item.event_id == assignment.event_id and item.category == assignment.category)
    ] + [assignment]
    updated = build_event_plan(plan.model_copy(update={"vendor_assignments": assignments}), catalog, today)
    task_category = VENDOR_CATEGORY_LABELS[assignment.category.value]
    updated.tasks = [
        task.model_copy(update={"status": "IN_PROGRESS"})
        if task.event_id == assignment.event_id and task.budget_category == task_category
        else task
        for task in updated.tasks
    ]
    roots = {
        task.id for task in updated.tasks
        if task.event_id == assignment.event_id and task.budget_category == task_category
    }
    hops = _dependent_hops(updated.tasks, roots)
    event_guests = next(event.guest_count for day in updated.days for event in day.events if event.id == assignment.event_id)
    violations = []
    if assignment.capacity is not None and assignment.capacity < event_guests:
        violations.append(f"{assignment.category.value} vendor capacity ({assignment.capacity}) is below event attendance ({event_guests}).")
    diff = CascadeDiff(
        mutated_attribute="vendor_assignment",
        affected_task_ids=sorted(hops),
        affected_budget_categories=[next((bucket.category for bucket in updated.budget_buckets if bucket.category == task_category), assignment.category.value.title())],
        node_hops=hops,
        violations=violations,
        summary=f"Vendor quote added to {assignment.category.value} for this event; {len(hops)} task(s) are affected.",
    )
    return updated, diff


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
            expanded, catalog, today, "set_guest_count", event_id=target.id,
            guest_count=(target.guest_count or plan.guest_count) + increase,
        )
        fixtures.append({
            "id": "guest_increase",
            "title": f"Add {increase} guests to {target.custom_name or _metadata(target, catalog, _index_catalog(catalog))['display_name']}",
            "description": "Uses the per-plate range you entered and updates this event's venue fit.",
            "updated_plan": updated,
            "diff": diff,
            "is_saved_fixture": True,
        })

    outdoor = next((event for _, event in events if (event.venue_type or "").casefold() in {"outdoor", "garden", "lawn"}), None)
    if outdoor is not None:
        updated, diff = edit_event_plan(
            plan, catalog, today, "update_event", event_id=outdoor.id,
            event=outdoor.model_copy(update={"venue_type": "indoor"}),
        )
        fixtures.append({
            "id": "outdoor_venue_loss",
            "title": f"Move {outdoor.custom_name or _metadata(outdoor, catalog, _index_catalog(catalog))['display_name']} indoors",
            "description": "Applies only because this event is marked as an outdoor venue.",
            "updated_plan": updated,
            "diff": diff,
            "is_saved_fixture": True,
        })

    if plan.first_event_date is not None:
        shifted = plan.model_copy(update={"first_event_date": plan.first_event_date - timedelta(days=14)})
        updated = build_event_plan(shifted, catalog, today)
        task_ids = {task.id for task in plan.tasks}
        hops = {task_id: 0 for task_id in task_ids}
        fixtures.append({
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
        })
    return fixtures

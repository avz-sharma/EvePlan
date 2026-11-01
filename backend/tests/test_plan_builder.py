from datetime import date, timedelta

import pytest

from app.engine.cascade_replanner import apply_event_plan_delta
from app.engine.dependency_scheduler import topological_sort_tasks
from app.engine.event_operations import edit_event_plan
from app.engine.plan_builder import build_event_plan
from app.engine.scenarios import build_quick_scenario_fixtures
from app.engine.vendor_operations import assign_vendor
from app.routers.onboarding_router import EXAMPLE_SELECTIONS, _example_days
from app.schemas.intent_delta import PlanDelta
from app.schemas.plan_state import EventPlan, PlanEvent, VendorAssignment
from app.services.custom_event_mapper import suggest_catalog_event
from app.services.event_catalog import load_event_catalog

TODAY = date(2026, 10, 30)


def draft_for(preset_id: str, *, special_diets: dict[str, int] | None = None) -> EventPlan:
    title = EXAMPLE_SELECTIONS[preset_id][0]
    return EventPlan(
        id=f"test-{preset_id}",
        title=title,
        template="celebration",
        guest_count=120,
        total_budget_cap_inr=1_500_000,
        budget_range_min_inr=1_000_000,
        budget_range_max_inr=1_500_000,
        per_plate_min_inr=700,
        per_plate_max_inr=1000,
        city="Pune",
        first_event_date=TODAY + timedelta(days=120),
        days=_example_days(preset_id, load_event_catalog()),
        special_diets=special_diets or {},
    )


@pytest.mark.parametrize("preset_id", list(EXAMPLE_SELECTIONS))
def test_every_example_builds_a_valid_dag_and_event_relative_dates(preset_id: str) -> None:
    plan = build_event_plan(draft_for(preset_id), load_event_catalog(), TODAY)
    sorted_tasks = topological_sort_tasks(plan.tasks)
    assert len(sorted_tasks) == len(plan.tasks)
    for task in plan.tasks:
        assert task.event_id
        assert task.event_date
        assert task.due_date == task.event_date - timedelta(days=task.lead_time_days or 0)


def test_each_event_defaults_to_total_guests_and_hints_infer_without_religion_field() -> None:
    plan = build_event_plan(draft_for("nikah_walima"), load_event_catalog(), TODAY)
    assert all(event.guest_count == plan.guest_count for day in plan.days for event in day.events)
    assert any("halal" in hint.lower() for hint in plan.profile_hints["food_defaults"])
    assert "nikah_context" not in str(plan.profile_hints)
    assert "religion" not in plan.model_dump()


def test_unquoted_categories_are_not_assigned_market_price_estimates() -> None:
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    venue = next(bucket for bucket in plan.budget_buckets if bucket.category == "Venue")
    assert venue.allocated_min_inr == 0
    assert venue.allocated_max_inr == 0
    assert any("not estimated" in assumption.lower() for assumption in venue.assumptions)


def test_changing_one_event_guest_count_cascades_only_that_events_catering_tasks() -> None:
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    target = plan.days[0].events[0]
    plan, _ = assign_vendor(
        plan,
        load_event_catalog(),
        TODAY,
        VendorAssignment(event_id=target.id, category="caterer", place_id="ChIJkeep"),
    )
    old_others = [event.guest_count for day in plan.days for event in day.events if event.id != target.id]

    updated, diff = edit_event_plan(
        plan, load_event_catalog(), TODAY, "set_guest_count", event_id=target.id, guest_count=75
    )

    changed = next(event for day in updated.days for event in day.events if event.id == target.id)
    assert changed.guest_count == 75
    assert [event.guest_count for day in updated.days for event in day.events if event.id != target.id] == old_others
    assert diff.affected_budget_categories == ["Catering", "Venue"]
    assert all(task_id.startswith(f"{target.id}:") for task_id in diff.affected_task_ids)
    assert next(task for task in updated.tasks if task.id == f"{target.id}:catering_menu_lock").status == "IN_PROGRESS"


def test_reordering_days_shifts_event_dates_and_relative_task_dates() -> None:
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    target = plan.days[0].events[0]
    before_date = plan.days[0].date
    before_due = next(task.due_date for task in plan.tasks if task.event_id == target.id)

    updated, _ = edit_event_plan(plan, load_event_catalog(), TODAY, "reorder_days", day_number=1, target_day_number=3)

    moved = next(day for day in updated.days if any(event.id == target.id for event in day.events))
    after_due = next(task.due_date for task in updated.tasks if task.event_id == target.id)
    assert moved.date == before_date + timedelta(days=2)
    assert after_due == before_due + timedelta(days=2)


def test_removing_event_removes_its_tasks_and_rebuilds_remaining_dependencies() -> None:
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    removed = plan.days[1].events[0]
    catalog = load_event_catalog()
    quoted, _ = assign_vendor(
        plan, catalog, TODAY,
        VendorAssignment(event_id=removed.id, category="caterer", place_id="ChIJremove", quoted_total_inr=50_000),
    )
    updated, diff = edit_event_plan(quoted, catalog, TODAY, "remove_event", event_id=removed.id)
    assert all(event.id != removed.id for day in updated.days for event in day.events)
    assert all(task.event_id != removed.id for task in updated.tasks)
    assert all(assignment.event_id != removed.id for assignment in updated.vendor_assignments)
    before_catering = next(bucket.allocated_max_inr for bucket in quoted.budget_buckets if bucket.category == "Catering")
    after_catering = next(bucket.allocated_max_inr for bucket in updated.budget_buckets if bucket.category == "Catering")
    assert after_catering < before_catering
    task_ids = {task.id for task in updated.tasks}
    assert all(dependency in task_ids for task in updated.tasks for dependency in task.dependencies)
    assert any(task_id.startswith(f"{removed.id}:") for task_id in diff.affected_task_ids)
    topological_sort_tasks(updated.tasks)


def test_picking_vendor_updates_only_user_quote_budget_and_task_state() -> None:
    plan = build_event_plan(draft_for("three_day_celebration"), load_event_catalog(), TODAY)
    event = plan.days[0].events[0]
    quote_before = next(bucket.allocated_max_inr for bucket in plan.budget_buckets if bucket.category == "Catering")
    updated, diff = assign_vendor(
        plan,
        load_event_catalog(),
        TODAY,
        VendorAssignment(
            event_id=event.id,
            category="caterer",
            place_id="ChIJtest",
            notes="Call after 4pm",
            quoted_total_inr=95_000,
            category_budget_cap_inr=80_000,
            capacity=100,
        ),
    )
    quote_after = next(bucket.allocated_max_inr for bucket in updated.budget_buckets if bucket.category == "Catering")
    assert quote_after != quote_before
    catering = next(bucket for bucket in updated.budget_buckets if bucket.category == "Catering")
    assert catering.category_budget_cap_inr == 80_000
    assert catering.is_violated
    assert any(task.status == "IN_PROGRESS" and task.event_id == event.id for task in updated.tasks)
    assert any("capacity" in violation.lower() for violation in diff.violations)
    assert diff.affected_budget_categories == ["Catering"]
    assert updated.vendor_assignments[0].place_id == "ChIJtest"


def test_custom_event_uses_user_text_and_generic_template_without_inference_tags() -> None:
    draft = draft_for("three_day_celebration")
    custom = PlanEvent(id="custom-welcome", custom_name="Welcome gathering", time_slot="afternoon")
    days = [day.model_copy(deep=True) for day in draft.days]
    days[0].events.append(custom)
    plan = build_event_plan(draft.model_copy(update={"days": days}), load_event_catalog(), TODAY)
    assert any(task.id == "custom-welcome:event_brief" and "Welcome gathering" in task.title for task in plan.tasks)
    assert not any(task.id.startswith("custom-welcome:venue_booking") for task in plan.tasks)
    assert "religion" not in plan.model_dump()


def test_custom_event_mapping_uses_reviewed_saved_aliases() -> None:
    suggestion = suggest_catalog_event("  Church Service ")
    assert suggestion == {
        "catalog_id": "church_ceremony",
        "display_name": "Church ceremony",
        "source": "saved_fixture",
    }
    assert suggest_catalog_event("family brunch") is None


def test_custom_event_vendor_categories_have_pickable_tasks() -> None:
    draft = draft_for("three_day_celebration")
    custom = PlanEvent(
        id="custom-travel",
        custom_name="Family travel",
        time_slot="morning",
        vendor_categories=["transport", "photographer"],
    )
    days = [day.model_copy(deep=True) for day in draft.days]
    days[0].events.append(custom)
    plan = build_event_plan(draft.model_copy(update={"days": days}), load_event_catalog(), TODAY)
    relevant = [task for task in plan.tasks if task.event_id == custom.id]
    assert {task.budget_category for task in relevant} == {"Transport", "Photography", "Coordination"}

    updated, _ = assign_vendor(
        plan, load_event_catalog(), TODAY,
        VendorAssignment(event_id=custom.id, category="transport", place_id="manual:van"),
    )
    transport = next(task for task in updated.tasks if task.event_id == custom.id and task.budget_category == "Transport")
    assert transport.status == "IN_PROGRESS"


def test_each_catalog_vendor_need_has_a_corresponding_event_task() -> None:
    catalog = load_event_catalog()
    task_for_category = {
        "venue": "venue_booking",
        "caterer": "catering_menu_lock",
        "decorator": "decor_plan",
        "photographer": "photo_brief",
        "makeup": "makeup_plan",
        "music": "music_plan",
        "transport": "transport_plan",
    }
    for event in catalog["events"]:
        task_ids = {task["id"] for task in event["task_templates"]}
        assert all(task_for_category[category] in task_ids for category in event["vendor_categories_needed"])


def test_quick_scenario_fixtures_are_relative_and_only_relocate_selected_outdoor_events() -> None:
    catalog = load_event_catalog()
    plan = build_event_plan(draft_for("three_day_celebration"), catalog, TODAY)
    without_outdoor = build_quick_scenario_fixtures(plan, catalog, TODAY)
    assert "outdoor_venue_loss" not in {item["id"] for item in without_outdoor}

    days = [day.model_copy(deep=True) for day in plan.days]
    days[0].events[0] = days[0].events[0].model_copy(update={"venue_type": "outdoor"})
    outdoor_plan = build_event_plan(plan.model_copy(update={"days": days}), catalog, TODAY)
    fixtures = build_quick_scenario_fixtures(outdoor_plan, catalog, TODAY)
    by_id = {fixture["id"]: fixture for fixture in fixtures}
    assert "outdoor_venue_loss" in by_id
    changed = by_id["outdoor_venue_loss"]["updated_plan"]
    changed_event = changed.days[0].events[0]
    assert changed_event.venue_type == "indoor"
    shifted = by_id["date_shift"]["updated_plan"]
    assert shifted.first_event_date == outdoor_plan.first_event_date - timedelta(days=14)
    before_due = next(task.due_date for task in outdoor_plan.tasks if task.event_id == days[0].events[0].id)
    after_due = next(task.due_date for task in shifted.tasks if task.event_id == days[0].events[0].id)
    assert after_due == before_due - timedelta(days=14)


def test_legacy_intent_delta_rebuilds_event_plan_dates_and_guest_counts() -> None:
    catalog = load_event_catalog()
    plan = build_event_plan(draft_for("three_day_celebration"), catalog, TODAY)
    old_due_dates = {task.id: task.due_date for task in plan.tasks}

    updated, diff = apply_event_plan_delta(
        plan, PlanDelta(guest_count_delta=25, days_until_event_delta=-7), catalog, TODAY
    )

    assert updated.guest_count == plan.guest_count + 25
    assert all(event.guest_count == updated.guest_count for day in updated.days for event in day.events)
    assert all(task.due_date == old_due_dates[task.id] - timedelta(days=7) for task in updated.tasks)
    assert diff.mutated_attribute == "timeline_days"
    assert set(diff.affected_task_ids) == {task.id for task in updated.tasks}

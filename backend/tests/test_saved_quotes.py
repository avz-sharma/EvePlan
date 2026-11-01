from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.engine.event_operations import edit_event_plan
from app.engine.plan_builder import build_event_plan
from app.engine.quote_operations import mutate_quote
from app.engine.vendor_operations import assign_vendor
from app.main import app
from app.schemas.plan_state import SavedQuote, VendorAssignment, VendorCategory
from app.services import quote_analysis
from app.services.event_catalog import load_event_catalog
from tests.test_plan_builder import draft_for

TODAY = date(2026, 10, 30)
CATALOG = load_event_catalog()


def plan_and_quote(category=VendorCategory.DECORATOR):
    plan = build_event_plan(draft_for("three_day_celebration"), CATALOG, TODAY)
    quote = SavedQuote(id="q1", vendor_id="v1", vendor_name="Host vendor", event_id=plan.days[0].events[0].id,
                       category=category, original_inr=120000, finalized_inr=100000)
    return plan, quote


def change(plan, operation, **kw):
    return mutate_quote(plan, CATALOG, TODAY, operation, **kw)[0]


@pytest.mark.parametrize("category", list(VendorCategory))
def test_alternatives_selection_edit_switch_remove_and_contingency(category):
    plan, q = plan_and_quote(category)
    initial = plan.model_dump()
    saved = change(plan, "save", quote=q)
    assert saved.budget_buckets == plan.budget_buckets
    assert plan.model_dump() == initial
    second = q.model_copy(update={"id": "q2", "vendor_id": "v2", "finalized_inr": 80000})
    saved = change(saved, "save", quote=second)
    selected = change(saved, "select", quote_id="q1")
    selected = change(selected, "select", quote_id="q2")
    assert [q.id for q in selected.saved_quotes if q.selected] == ["q2"]
    changed = change(selected, "save", quote=selected.saved_quotes[1].model_copy(update={"finalized_inr": 0}))
    assert len(changed.saved_quotes) == 2
    assert sum(b.allocated_max_inr for b in changed.budget_buckets) == sum(b.allocated_max_inr for b in selected.budget_buckets) - 80000
    changed = change(selected, "contingency", contingency_percent=20)
    assert all(b.contingency_inr == round(b.allocated_max_inr * .2, 2) for b in changed.budget_buckets)
    removed = change(selected, "remove", quote_id="q2")
    assert removed.budget_buckets == plan.budget_buckets


def test_catering_replaces_only_one_event_and_legacy_assignment_is_not_doubled():
    plan, q = plan_and_quote(VendorCategory.CATERER)
    legacy = VendorAssignment(event_id=q.event_id, category=q.category, place_id="old", quoted_total_inr=90000)
    plan = assign_vendor(plan, CATALOG, TODAY, legacy)[0]
    plan = change(plan, "save", quote=q.model_copy(update={"selected": True}))
    catering = next(b for b in plan.budget_buckets if b.category == "Catering")
    assert catering.allocated_max_inr == 100000 + 2 * 120 * 1000
    assert catering.contingency_inr == 34000
    assert not plan.vendor_assignments
    plan = change(plan, "remove", quote_id=q.id)
    assert next(b for b in plan.budget_buckets if b.category == "Catering").allocated_max_inr == 360000


def test_event_move_rename_and_removal_keep_or_remove_associations():
    plan, q = plan_and_quote()
    plan = change(plan, "save", quote=q)
    moved = edit_event_plan(plan, CATALOG, TODAY, "move_event", event_id=q.event_id, target_day_number=2)[0]
    assert moved.saved_quotes == [q]
    renamed = moved.days[1].events[-1].model_copy(update={"catalog_id": None, "custom_name": "Renamed"})
    moved = edit_event_plan(moved, CATALOG, TODAY, "update_event", event_id=q.event_id, event=renamed)[0]
    assert moved.saved_quotes == [q]
    removed = edit_event_plan(moved, CATALOG, TODAY, "remove_event", event_id=q.event_id)[0]
    assert removed.saved_quotes == []


@pytest.mark.parametrize("amount", [-1, float("inf"), float("nan")])
def test_invalid_amounts_rejected(amount):
    _, q = plan_and_quote()
    with pytest.raises(ValidationError):
        SavedQuote.model_validate({**q.model_dump(), "finalized_inr": amount})


def test_api_rejects_missing_finalized_unknown_ids_and_cross_event_changes():
    plan, q = plan_and_quote()
    client = TestClient(app)
    def post(**values):
        return client.post("/api/plan/quotes/edit", json={"plan": plan.model_dump(mode="json"), **values})
    assert post(operation="save", quote={**q.model_dump(), "selected": True, "finalized_inr": None}).status_code == 422
    assert post(operation="remove", quote_id="missing").status_code == 422
    assert post(operation="save", quote={**q.model_dump(), "event_id": "missing"}).status_code == 422
    assert post(operation="contingency", contingency_percent=101).status_code == 422
    plan = change(plan, "save", quote=q)
    assert post(operation="save", quote={**q.model_dump(), "event_id": plan.days[1].events[0].id}).status_code == 422


def analysis_plan():
    plan, q = plan_and_quote()
    return plan.model_copy(update={"saved_quotes": [q, q.model_copy(update={"id": "q2", "vendor_id": "v2"})]})


def test_ai_unavailable_and_group_validation():
    plan = analysis_plan()
    with patch.object(quote_analysis, "is_groq_available", return_value=False):
        assert quote_analysis.analyze_quotes(plan, ["q1", "q2"]) is None
    with pytest.raises(ValueError):
        quote_analysis.analyze_quotes(plan, ["q1", "unknown"])
    mixed = plan.model_copy(update={"saved_quotes": [plan.saved_quotes[0], plan.saved_quotes[1].model_copy(update={"category": VendorCategory.MUSIC})]})
    with pytest.raises(ValueError):
        quote_analysis.analyze_quotes(mixed, ["q1", "q2"])


@pytest.mark.parametrize("response", ['{}', '{"winner_quote_id":"unknown","confidence":"high","winner_reason":"Unknown winner","vendor_assessments":[{"quote_id":"q1","advantages":[],"tradeoffs":[]},{"quote_id":"q2","advantages":[],"tradeoffs":[]}],"differences":[],"missing_details":[],"follow_up_questions":[]}', 'invalid'])
def test_ai_rejects_malformed_or_unknown_recommendations(response):
    quote_analysis._cache.clear()
    client = MagicMock()
    client.json.return_value = {"choices": [{"message": {"content": response}}]}
    with patch.object(quote_analysis, "is_groq_available", return_value=True), patch.object(quote_analysis.quota_guard, "try_acquire", return_value=True), patch("app.services.quote_analysis.httpx.post", return_value=client), patch.object(quote_analysis.settings, "GROQ_API_KEY", SimpleNamespace(get_secret_value=lambda: "test")):
        assert quote_analysis.analyze_quotes(analysis_plan(), ["q1", "q2"]) is None


def test_ai_caches_valid_analysis_and_changes_invalidate_cache():
    quote_analysis._cache.clear()
    client = MagicMock()
    client.json.return_value = {"choices": [{"message": {"content": '{"winner_quote_id":"q1","confidence":"medium","winner_reason":"q1 has a lower finalized quote.","vendor_assessments":[{"quote_id":"q1","advantages":["Lower final price"],"tradeoffs":["Terms need confirmation"]},{"quote_id":"q2","advantages":["More details provided"],"tradeoffs":["Higher final price"]}],"differences":[],"missing_details":["Terms not specified"],"follow_up_questions":["Taxes included?"]}'}}]}
    with patch.object(quote_analysis, "is_groq_available", return_value=True), patch.object(quote_analysis.quota_guard, "try_acquire", return_value=True), patch("app.services.quote_analysis.httpx.post", return_value=client) as post, patch.object(quote_analysis.settings, "GROQ_API_KEY", SimpleNamespace(get_secret_value=lambda: "test")):
        plan = analysis_plan()
        assert quote_analysis.analyze_quotes(plan, ["q1", "q2"]) is not None
        quote_analysis.analyze_quotes(plan, ["q2", "q1"])
        assert post.call_count == 1
        quote_analysis.analyze_quotes(plan.model_copy(update={"total_budget_cap_inr": 1}), ["q1", "q2"])
        assert post.call_count == 2


def test_replan_preserves_selected_prices_and_chosen_reserve():
    from app.routers.replan_router import _run_deterministic_replan
    from app.schemas.intent_delta import PlanDelta
    plan, q = plan_and_quote(VendorCategory.CATERER)
    plan = change(plan, "save", quote=q.model_copy(update={"selected": True}))
    plan = change(plan, "contingency", contingency_percent=20)
    updated, _, _ = _run_deterministic_replan(plan, PlanDelta(guest_count_delta=10))
    assert updated.saved_quotes == plan.saved_quotes
    assert updated.contingency_percent == 20
    assert all(b.contingency_inr == round(b.allocated_max_inr * .2, 2) for b in updated.budget_buckets)


def test_analysis_rejects_orphaned_event_without_provider_work():
    plan = analysis_plan()
    orphaned = plan.model_copy(update={"saved_quotes": [q.model_copy(update={"event_id": "unknown"}) for q in plan.saved_quotes]})
    with TestClient(app) as client:
        response = client.post("/api/vendor/analyze-saved", json={"plan": orphaned.model_dump(mode="json"), "quote_ids": ["q1", "q2"]})
    assert response.status_code == 422
    assert response.json() == {"detail": "Quotation event was not found"}

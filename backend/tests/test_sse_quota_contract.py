from importlib import import_module

from fastapi.testclient import TestClient

from app.main import app
from app.services.gemini_extractor import IntentExtractionUnavailable
from tests.plan_factory import generated_plan

replan_router = import_module("app.routers.replan_router")


def test_stream_uses_one_intent_call_and_template_rationale(monkeypatch):
    calls = []
    monkeypatch.setattr(replan_router, "is_gemini_available", lambda: True)

    def extract(_plan, prompt):
        calls.append(prompt)
        return {"guest_count_delta": 40}, False

    def second_call(*_args):
        raise AssertionError("A replan must not spend a second LLM call on rationale")

    monkeypatch.setattr(replan_router, "extract_intent_delta", extract)
    monkeypatch.setattr(replan_router, "generate_rationale", second_call, raising=False)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "+40 guests",
        })
    assert response.status_code == 200
    assert calls == ["+40 guests"]
    assert '"source": "template"' in response.text


def test_stream_uses_parser_when_provider_or_quota_is_unavailable(monkeypatch):
    monkeypatch.setattr(replan_router, "is_gemini_available", lambda: True)

    def unavailable(*_args):
        raise IntentExtractionUnavailable("Mock quota exhaustion")

    monkeypatch.setattr(replan_router, "extract_intent_delta", unavailable)
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "+40 guests",
        })
    assert '"source": "fallback"' in response.text
    assert '"guest_count": 160' in response.text
    assert '"degraded_mode": true' in response.text

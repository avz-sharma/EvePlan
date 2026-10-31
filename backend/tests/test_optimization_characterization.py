import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.engine.cascade_replanner import apply_event_plan_delta
from app.engine.dependency_scheduler import compute_cpm_schedule, topological_sort_tasks
from app.main import app
from app.schemas.intent_delta import PlanDelta
from app.services.event_catalog import load_event_catalog
from tests.plan_factory import TODAY, generated_plan


@pytest.mark.parametrize("delta", [
    PlanDelta(guest_count_delta=40),
    PlanDelta(days_until_event_delta=-7, new_constraints=["Confirm access"]),
    PlanDelta(dietary_jain_delta=10, venue_capacity_override=90),
])
def test_300_task_cascade_preserves_inputs_and_schedule_contract(delta: PlanDelta) -> None:
    plan = generated_plan()
    before = plan.model_dump_json()
    assert len(plan.tasks) == 300
    updated, diff = apply_event_plan_delta(
        plan, delta, load_event_catalog(), TODAY,
    )
    assert plan.model_dump_json() == before
    assert updated.guest_count == 120 + delta.guest_count_delta
    assert len(updated.tasks) == 300
    assert {task.id for task in topological_sort_tasks(updated.tasks)} == {
        task.id for task in plan.tasks
    }
    assert diff.affected_task_ids
    assert compute_cpm_schedule(updated.tasks) == compute_cpm_schedule(
        compute_cpm_schedule(updated.tasks)
    )


def test_sse_matches_post_engine_result_and_orders_events(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    plan = generated_plan(1).model_dump(mode="json")
    with TestClient(app) as client:
        response = client.post("/api/plan/replan/stream", json={
            "plan": plan, "user_prompt": "+40 guests",
        })
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = [block.splitlines() for block in response.text.strip().split("\n\n")]
        assert [lines[0] for lines in events] == [
            "event: delta", "event: engine_diff", "event: rationale",
        ]
        payloads = [json.loads(lines[1].removeprefix("data: ")) for lines in events]
        post = client.post("/api/plan/replan", json={
            "plan": plan, "delta": payloads[0]["delta"],
        })
        assert post.status_code == 200
        assert payloads[1]["updated_plan"] == post.json()["updated_plan"]
        assert payloads[2]["rationale"]

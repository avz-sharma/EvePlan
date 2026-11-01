"""Request boundaries and numeric/date extremes must fail without partial plan output."""

import asyncio
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.engine.dependency_scheduler import CyclicDependencyError, compute_cpm_schedule
from app.engine.event_operations import edit_event_plan
from app.engine.plan_builder import build_event_plan
from app.engine.plan_diff import dependent_hops
from app.engine.quote_operations import mutate_quote
from app.main import app
from app.schemas.plan_state import SavedQuote, TaskNode, VendorCategory
from app.services.event_catalog import load_event_catalog
from app.services.upload_validator import MAX_UPLOAD_BYTES
from tests.plan_factory import TODAY, generated_plan


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", ""),
        ("title", "x" * 121),
        ("guest_count", 0),
        ("guest_count", -1),
        ("guest_count", 100_001),
    ("guest_count", 10**100),
    ("total_budget_cap_inr", 0),
        ("total_budget_cap_inr", -1),
        ("budget_range_max_inr", -1),
        ("per_plate_min_inr", -1),
        ("first_event_date", "2027-02-29"),
        ("first_event_date", "0001-01-01"),
        ("first_event_date", "9999-12-31"),
        ("first_event_date", "not a date"),
        ("special_diets", {"jain": -1}),
        ("special_diets", {"jain": 121}),
    ],
)
def test_invalid_build_input_is_rejected_with_the_existing_error_shape(field, value):
    payload = generated_plan(1).model_dump(mode="json")
    payload[field] = value
    with TestClient(app) as client:
        response = client.post("/api/plan/build", json=payload)
    assert response.status_code == 422
    assert set(response.json()) == {"detail"}


@pytest.mark.parametrize("prompt", ["", "x" * 501])
def test_empty_and_oversized_prompts_are_rejected_before_streaming(prompt):
    with TestClient(app) as client:
        response = client.post(
            "/api/plan/replan/stream",
            json={
                "plan": generated_plan(1).model_dump(mode="json"),
                "user_prompt": prompt,
            },
        )
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


def test_leap_day_and_large_valid_host_inputs_remain_supported():
    draft = generated_plan(1).model_copy(
        update={
            "first_event_date": date(2028, 2, 29),
            "guest_count": 100_000,
            "total_budget_cap_inr": 1e12,
            "budget_range_max_inr": 1e12,
        }
    )
    built = build_event_plan(draft, load_event_catalog(), TODAY)
    assert built.days[0].date == date(2028, 2, 29)
    assert built.days[1].date == date(2028, 3, 1)
    assert built.guest_count == 100_000 and built.total_budget_cap_inr == 1e12


@pytest.mark.parametrize("amount", [float("inf"), float("nan")])
def test_nonfinite_numbers_never_enter_plan_or_provider_intent(amount):
    payload = generated_plan(1).model_dump(mode="json")
    payload["total_budget_cap_inr"] = amount
    with TestClient(app) as client:
        response = client.post(
            "/api/plan/build",
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 422


def test_calendar_overflow_and_excessive_guest_change_return_readable_errors():
    payload = generated_plan(1).model_dump(mode="json")
    with TestClient(app) as client:
        for delta in [{"days_until_event_delta": 10**12}, {"guest_count_delta": 100_000}]:
            response = client.post("/api/plan/replan", json={"plan": payload, "delta": delta})
            assert response.status_code == 422
            assert isinstance(response.json()["detail"], str)


def test_quote_day_removal_cascades_without_mutating_the_saved_snapshot():
    catalog = load_event_catalog()
    plan = generated_plan(1)
    event_id = plan.days[0].events[0].id
    quote = SavedQuote(
        id="removed-day",
        vendor_id="host-vendor",
        vendor_name="Written offer",
        event_id=event_id,
        category=VendorCategory.CATERER,
        original_inr=10000,
        finalized_inr=9000,
        selected=True,
    )
    selected, _ = mutate_quote(plan, catalog, TODAY, "save", quote=quote)
    before = selected.model_dump()
    removed, diff = edit_event_plan(selected, catalog, TODAY, "remove_day", day_number=1)
    assert not removed.saved_quotes
    assert all(task.event_id != event_id for task in removed.tasks)
    assert any(task_id.startswith(event_id + ":") for task_id in diff.affected_task_ids)
    assert selected.model_dump() == before


def test_diamond_dependencies_keep_shortest_hops_and_cycles_fail():
    tasks = [
        TaskNode(
            id=task_id,
            title=task_id,
            category="Coordination",
            duration_days=1,
            dependencies=dependencies,
        )
        for task_id, dependencies in [
            ("root", []),
            ("left", ["root"]),
            ("right", ["root"]),
            ("end", ["left", "right"]),
        ]
    ]
    assert dependent_hops(tasks, {"root"}) == {"root": 0, "left": 1, "right": 1, "end": 2}
    scheduled = compute_cpm_schedule(tasks)
    assert next(task for task in scheduled if task.id == "end").earliest_start == 2
    tasks[0] = tasks[0].model_copy(update={"dependencies": ["end"]})
    with pytest.raises(CyclicDependencyError):
        compute_cpm_schedule(tasks)


def test_legacy_upload_endpoint_is_validation_only_and_enforces_its_cap():
    with TestClient(app) as client:
        valid = client.post(
            "/api/vendor/upload", files={"file": ("quote.png", b"\x89PNG\r\n\x1a\n" + b"0" * 20)}
        )
        oversized = client.post(
            "/api/vendor/upload",
            files={"file": ("quote.png", b"\x89PNG\r\n\x1a\n" + b"0" * MAX_UPLOAD_BYTES)},
        )
        corrupt = client.post(
            "/api/vendor/upload", files={"file": ("quote.pdf", b"%PDF-corrupt" + b"0" * 20)}
        )
    assert valid.status_code == 501
    assert oversized.status_code == 413
    assert corrupt.status_code == 400


def test_sse_disconnect_stops_before_emitting_an_engine_result():
    async def request():
        content = json.dumps(
            {"plan": generated_plan(1).model_dump(mode="json"), "user_prompt": "+40 guests"}
        ).encode()
        disconnected = asyncio.Event()
        delivered = False
        messages = []

        async def receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": content, "more_body": False}
            await disconnected.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)
            if message["type"] == "http.response.body" and b"event: delta" in message.get(
                "body", b""
            ):
                disconnected.set()
                await asyncio.sleep(0.01)

        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "method": "POST",
            "path": "/api/plan/replan/stream",
            "raw_path": b"/api/plan/replan/stream",
            "query_string": b"",
            "headers": [(b"content-type", b"application/json")],
            "scheme": "http",
            "http_version": "1.1",
            "server": ("testserver", 80),
            "client": ("disconnect-test", 1234),
        }
        await asyncio.wait_for(app(scope, receive, send), timeout=3)
        frames = b"".join(message.get("body", b"") for message in messages)
        assert b"event: delta" in frames
        assert b"event: engine_diff" not in frames

    asyncio.run(request())

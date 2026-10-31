"""Run from backend: python -m tests.benchmark_engine baseline|after."""

import cProfile
import json
import statistics
import sys
from pathlib import Path
from time import perf_counter

from fastapi.testclient import TestClient

from app.engine.cascade_replanner import apply_event_plan_delta
from app.engine.dependency_scheduler import compute_cpm_schedule
from app.main import app
from app.schemas.intent_delta import PlanDelta
from app.services.event_catalog import load_event_catalog
from tests.plan_factory import TODAY, generated_plan


def measure(callback, iterations=100):
    for _ in range(5):
        callback()
    samples = []
    for _ in range(iterations):
        start = perf_counter()
        callback()
        samples.append((perf_counter() - start) * 1000)
    return {"p50_ms": statistics.median(samples), "p95_ms": sorted(samples)[94]}


def main():
    phase = sys.argv[1]
    output = Path(__file__).resolve().parents[2] / "docs" / "measurements"
    output.mkdir(exist_ok=True)
    plan = generated_plan()
    catalog = load_event_catalog()
    delta = PlanDelta(guest_count_delta=40)
    def cascade():
        return apply_event_plan_delta(plan, delta, catalog, TODAY)
    profiler = cProfile.Profile()
    profiler.runcall(cascade)
    profiler.dump_stats(str(output / f"{phase}-engine.prof"))
    results = {"tasks": len(plan.tasks), "dag": measure(lambda: compute_cpm_schedule(plan.tasks)),
               "cascade": measure(cascade)}
    with TestClient(app) as client:
        body = {"plan": plan.model_dump(mode="json"), "delta": delta.model_dump(mode="json")}
        def request():
            response = client.post("/api/plan/replan", json=body)
            response.raise_for_status()
        results["api_replan"] = measure(request)
    (output / f"{phase}-engine.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()

# Optimization report

Status: baseline and characterization in progress; no runtime refactors completed yet.

## Reproducible baseline

Measurements use a generated 300-task, five-day plan with 50 catalog event instances. Engine and in-process API medians use 100 iterations after five warm-up iterations on the same Windows host. API measurements include serialization and TestClient overhead, but no external network latency. Raw data lives in `docs/measurements`.

| Metric | Before | After |
| --- | ---: | ---: |
| DAG p50, 300 tasks | 3.34 ms | Pending |
| Cascade p50, 300 tasks | 21.31 ms | Pending |
| Replan API p50, 300 tasks | 32.31 ms | Pending |
| Backend tests | 63 | Pending |
| Backend line coverage | 80.19% | Pending |
| Engine line coverage | 78.97% | Pending |
| Frontend tests | 8 (previous verified run) | Pending |
| Production JS / gzip | Pending visualizer build | Pending |
| Overview mobile Lighthouse performance / accessibility | Pending | Pending |
| Vendors mobile Lighthouse performance / accessibility | Pending | Pending |
| Cascade React Profiler, 4x CPU | Pending | Pending |

## Baseline findings

The measured engine profile attributes most cascade time to deep copying. The candidate plan copies all tasks and all days, while days are copied a second time and derived tasks are rebuilt immediately afterward. Any optimization must preserve input immutability and completed task state. Existing scenario snapshots and the new 300-task/SSE characterization tests protect those contracts.

The pre-existing working tree was not represented in Git. Unrelated staged deletions of two original specification files must remain outside optimization commits.

## Tooling notes

The Windows sandbox blocks the local socket pair needed by Starlette TestClient. The approved external run completed 63 tests and produced coverage. npm failed while interpreting pnpm's existing node_modules tree; installation is proceeding with the repository's package manager. Browser measurements will use a local Chrome DevTools MCP process because that server is not exposed in this Codex tool session.

## Sources

- [React Profiler: profiling builds and measurement overhead](https://react.dev/reference/react/Profiler)
- [Lighthouse throttling methods](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md)

## Self-review evidence (in progress)

| Criterion | Evidence and remaining work |
| --- | --- |
| Code quality | `docs/phase-3-audit.md`; runtime refactors pending. |
| Security | Baseline secret/dependency scans pending. |
| Efficiency | `docs/measurements/baseline-engine.json`, `baseline-engine.prof`; browser metrics pending. |
| Testing | `backend/tests/test_optimization_characterization.py`, `plan_factory.py`; frontend characterization pending. |
| Accessibility | Existing keyboard and reduced-motion paths; automated audits pending. |
| Problem statement alignment | Phase 1/2 scenario fixtures retained; final acceptance rerun pending. |

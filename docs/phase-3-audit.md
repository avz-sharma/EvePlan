# Optimization audit

Baseline source: the Phase 1/2 working tree after the 61 backend / 8 frontend test run. The initial Git commit contains only two specification documents; their staged deletions predate this task and must not enter optimization commits.

## Confirmed findings before refactoring

- Tabs already use dynamic imports, but the wizard and quote modal are eager imports in `App.tsx`. The app passes one 24-field props object to every tab. Stream updates rerender the shell.
- `layoutDag` is memoized by task-array identity, so equivalent restored plans trigger layout again. Its node records include presentation data; a topology-only cache must not retain stale task status or titles.
- `sseClient.ts` lacks an abort signal and reader cleanup. `App.tsx` has no cancellation on unmount/new requests.
- Fonts currently use system stacks, with no external font download. Any self-hosted replacement needs a license and a documented visual change.
- All glass panels apply backdrop blur; three fixed background shapes also use blur. Motion must preserve the existing reduced-motion behavior.
- TypeScript is strict, but the lint command only runs TypeScript. No ESLint or DOM accessibility suite exists.
- The DAG's cycle-error path compares Pydantic objects against a list. Cascade root discovery repeatedly scans the tasks. Both can use ID sets while preserving output order.
- Places creates HTTP clients per request. Synchronous provider calls and Gemini calls run inside the asynchronous streaming path without offloading.
- The current SSE path can request both intent extraction and rationale from Gemini. This conflicts with the existing one-call acceptance requirement and is recorded as a pre-existing acceptance gap, not a performance finding.
- Docker installs an incomplete dependency list, runs as root, and has no healthcheck. No compression, request body limit, generic request rate limit, or CSP is installed.
- CI has no coverage threshold, SSE contract, axe, Playwright, dependency vulnerability audit, or history secret scan.

## Measurement and change order

1. Add characterization and measurement tools without changing runtime behavior; record bundle, 300-task engine, coverage, mobile Lighthouse, and cascade profile measurements.
2. Preserve the source baseline separately from subsequent refactors. Keep unrelated staged document deletions untouched.
3. Refactor one concern per commit, running relevant tests and static checks before each commit.
4. Repeat identical measurements, update requirements/setup/deployment guidance, and record limitations honestly.

Each new test/tool file serves one reproducible acceptance or measurement purpose. No memoization beyond the requested layout cache will be added without profile evidence.

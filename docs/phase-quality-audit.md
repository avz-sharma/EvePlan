# Code quality audit

Baseline: `499cb8f`, November 1, 2026. Work branch: `codex/code-quality`.
Remote HEAD points to `codex/optimization`, not `main`. No submission or deployment is part of this work.

## Findings, ranked by impact

1. `engine/plan_builder.py` mixes construction, event edits, quote selection, vendor assignment and scenarios (631 lines). `edit_event_plan` spans 116 lines, estimated cyclomatic complexity 69, nesting 9. `cascade_replanner.py` is 305 lines; `apply_event_plan_delta` is 132 lines, complexity 54. Keep the pure engine and existing response contracts while separating these responsibilities.
2. Frontend `streamReplan` is 91 lines, complexity 28, nesting 5. Onboarding is 180 lines, complexity 24, with form logic interleaved with markup; saved quotes have complexity 36. Extract stream framing and onboarding logic first. No hand-written frontend module exceeds 300 physical lines; long JSX lines hide function size.
3. Groq intent and quote analysis and PDF validation catch `Exception`; quote analysis silently falls back. Several fetch results are implicitly `any`. Cookie deserialization and catalog dictionaries use explicit Python `Any`. Use validated boundary types and specific provider errors; keep intentional degradation visible.
4. Coverage gaps include most live Groq extraction paths, legacy cascade variations, event-edit failures, body guards and upload routes. Backend baseline: 119 tests, 1,599/1,813 statements (88.20%); frontend: 65 tests, 678/861 lines (78.74%), branches 58.92%. Add assertions around observable fallback, validation, history and cancellation behavior rather than internals.
5. Root requirements is a broken redirect to an absent file. Two staged-for-deletion planning drafts are obsolete scaffolding. `rules.md` contains agent instructions. README duplicates setup/deployment and references unavailable local audits and an absent appendix. Preserve existing staged work and replace the broken reader documentation.
6. AST inventory finds 99 undocumented public Python objects/modules and 47 undocumented frontend exports. Existing lint/type checks do not enforce documentation or formatting. Add useful API documentation, a formatter policy, and a shared check entry point without new dependencies.
7. Existing accessibility is strong: axe runs on all eight tabs; Lighthouse overview/vendors both score 100 accessibility and 100 performance. Add browser keyboard dialog/flow checks and check real-browser contrast on the remaining tabs. Retain reduced motion, focus styles and streaming live regions.

## Measurements and method

All 12 README commands passed before source edits: Ruff, strict mypy, pytest, engine coverage, Bandit, hashed dev pip-audit, frontend lint, Knip, Vitest coverage, production build, pnpm audit and Playwright smoke (10 tests).

Baseline JavaScript: 381,961 bytes raw, 127,749 bytes summed gzip across chunks. CSS: 29,002 bytes reported by Vite (rounded build display: 29.00 kB). Engine/API timing and Lighthouse JSON are under `docs/measurements/quality-baseline-*`.

`quality-baseline-source.json` records LOC for every authored production Python/TS/TSX file and Python function complexity/nesting; `quality-baseline-frontend-source.json` records TypeScript compiler AST function metrics. Complexity counts decisions, boolean alternatives and comprehensions; it is a reproducible static estimate, not Radon. Generated declarations, vendored assets and tests are excluded.

Exact normalized eight-line clone detection (minimum 200 characters, excluding comments/imports) found 0 duplicated lines among 4,273 meaningful source lines: 0.00%. This conservative method misses structural and short duplication. Manual inspection found repeated HTTP error wrapping and graph traversal. Knip reports no unused exports or dependencies. Ruff reports no unused Python imports; AST/reference inspection is used for Python dead-code candidates rather than installing Vulture. No dependencies or lockfiles need changing based on this evidence.

No production `type: ignore`, `eslint-disable`, bare `except`, `print` or `console.log` was found. Three broad `Exception` catches need narrowing. Catch-and-ignore storage persistence and reader cancellation intentionally preserve offline use/cancellation; errors that prevent a user action should be displayed. Constants to consolidate include session/flow lifetimes, cache limits and stream field offsets. Full missing-doc lists are in the source inventory.

## Impact and assumptions

Routes call pure builder/edit/quote functions; the frontend consumes unchanged generated schemas. Extracted modules must not import API/network/file I/O. Existing scenario snapshots, immutable-input tests and five-minute journey cover derived budgets, cascade IDs and selections. No schema, storage-key, route, auth policy, deployment or migration change is planned. Each focused step runs all README checks. Rollback consists of reverting only the corresponding new commit; pre-existing staged deletions and `.gitignore` changes remain outside our commits.

Security review will exercise cookie purpose/expiry, PKCE provider failure, origin enforcement, body limits, validated model output and prompt-data boundaries. Optional external providers are mocked; no real OAuth credentials or Groq key is needed. Evaluation scores are external and cannot be inferred from these metrics.

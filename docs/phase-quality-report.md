# Quality improvement report

Completed November 2, 2026 on `codex/code-quality`, based on `499cb8f`. The remote default branch is **`codex/optimization`, not `main`**. Nothing was pushed, deployed or submitted to PromptWars. External evaluation scores were not rerun; the 94+ Code Quality target cannot be claimed from local checks alone.

## Before and after

| Metric | Before | After |
| --- | ---: | ---: |
| Backend tests | 119 | 178 |
| Backend statement coverage | 88.20% | 93.12% |
| Engine coverage | 84.72% | 89.85% |
| Frontend tests | 48 | 61 |
| Frontend line coverage | 78.74% | 79.18% |
| Frontend branch coverage | 58.92% | 60.62% |
| Playwright smoke tests | 8 | 10 |
| Total JavaScript, all chunks | 381,961 bytes | 340,626 bytes (-10.8%) |
| Summed chunk gzip | 127,749 bytes | 116,338 bytes (-8.9%) |
| Entry JavaScript, Vite display | 289.70 kB | 247.17 kB |
| CSS, rounded Vite display | 29.00 kB | 28.97 kB |
| Largest authored production file | 631 lines | 294 lines |
| Maximum estimated Python complexity | 69 | 34 |
| Maximum Python nesting | 9 | 5 |
| SSE request function | 91 lines / complexity 28 | 26 lines / complexity 14 |
| Missing Python public/module docs | 99 | 0 |
| Missing frontend export docs | 47 | 0 |
| Exact eight-line clone estimate | 0.00% | 0.00% |
| Authored source LOC | 5,355 | 6,502, including documentation and expanded formatting |
| Lighthouse performance/accessibility | 100/100 on overview and vendors | 100/100 on all eight tabs |
| Browser axe | No initial full-browser all-tab measurement | Zero violations on all eight tabs and budget recovery cards |

Per-file LOC, function decisions, nesting, missing documentation and clone-detection methodology are recorded in the `quality-baseline-*` and `quality-after-*` source inventories. Generated declarations, vendored libraries and tests are excluded from the production source inventory. Exact clone detection is conservative and is not a claim of zero structural duplication.

## Latency and ownership

The initial standalone 300-task API baseline was 19.79 ms median / 23.32 ms p95. A later pre-optimization standalone run was 25.10 / 30.28 ms; the unchanged DAG code slowed too. The first interleaved comparison still showed a small p95 increase. Those diagnostics are retained in local `.tools/quality-evidence/` and `quality-performance-before-ownership-fix.json`.

Redundant copies of newly owned task nodes were removed. Event/day edits now copy their mutable lists explicitly while retaining scalar/enum values. Tests verify that modifying returned task dependencies, statuses, event lists and vendor-category lists does not change the original plan, and that completed/blocked statuses survive rebuilding.

The final comparison runs the original app archived from `499cb8f` and current app in alternating fresh processes, three rounds of 100 iterations with five warmups each. No best run is selected: values below are medians of run percentiles. All six runs are in [quality-performance-comparison.json](measurements/quality-performance-comparison.json).

| Paired 300-task metric | Original | Final |
| --- | ---: | ---: |
| Cascade median | 10.35 ms | 8.95 ms |
| Cascade p95 | 19.67 ms | 17.51 ms |
| API median | 31.40 ms | 30.48 ms |
| API p95 | 44.07 ms | 43.07 ms |

The paired summary shows no API regression. Host timing varied substantially, so the original standalone run and paired numbers should not be treated as directly interchangeable or as a production latency guarantee. The benchmark and source-extraction scripts are committed for reproduction.

## Commit ledger

| Commit | Change |
| --- | --- |
| `010d332` | Recorded the baseline/audit, renamed agent guidance to `AGENTS.md`, and replaced the broken root requirements pointer with a reader-facing workflow map. |
| `741ae39` | Condensed README and moved setup, OAuth, deployment and workflow detail into linked docs; retained the five-minute demo. |
| `f8b1de2` | Separated pure construction, tasks, budgets, quotes, vendor assignment, event edits and scenarios; extracted onboarding state into a hook. |
| `5d4af17` | Replaced Python `Any` with typed catalog records, centralized API error translation, typed JSON boundaries, narrowed provider/PDF catches and separated SSE framing. |
| `4deba37` | Named shared limits and choices; loaded the animation features actually used by the UI; added saved-plan/history checks. |
| `7693f65` | Documented public objects/exports, formatted Python and synchronized API descriptions and generated declarations. |
| `03fd063` | Added editor/formatter policies and one local/CI quality command, preserving existing gates and adding formatting/docstring checks. |
| `e5e026a` | Removed unreachable validation and preserved reproducible source-audit tools. |
| `e1b9942` | Hardened invalid numeric/date/OAuth/quote inputs, fixed validation-error serialization, added error/loading/storage/keyboard coverage, corrected Budget headings/recovery semantics, and removed measured copy overhead. |
| Report commit | Recorded final measurements, security findings and review limitations. |

Each new engine module has a single purpose documented in its module header: event metadata, task creation, budget calculation, quote selection, quote mutation, event mutations, event orchestration, intent mutations, vendor assignment, scenarios, or retained legacy replanning. `schemas/catalog.py` defines their shared static input shapes; `operation_errors.py` owns HTTP error translation. The onboarding hook owns requests/drafts while its component renders the steps. The three root scripts provide the shared gates, source inventory and controlled performance comparison.

## Verification and scope

Every accepted step passed the complete README suite. Final verification uses the same 14-gate command as CI:

```powershell
.venv/Scripts/python.exe scripts/check.py
```

It runs Ruff, strict mypy, backend/engine coverage, Bandit, hashed development pip-audit, frontend type/lint/unused checks, coverage, build, pnpm audit and Playwright, plus Python formatting/public-docstring checks. It also verified clean startup/shutdown of its own offline smoke API. The demo journeys cover setup, event edits, streaming changes, undo/redo, branches, quotations and saved restoration at mobile/desktop widths.

Runtime pip-audit and a redacted all-history Gitleaks scan also passed. See [security.md](security.md). Real-browser axe and Lighthouse ran on all tabs, and recovery cards were checked with contrast enabled. Keyboard tests traverse every tab, contain dialog focus, restore the launcher, and apply recovery options. Existing reduced-motion checks remain intact. No drag-and-drop flow requires an additional alternative: event movement already uses native controls.

Local measurements used Python 3.13.9, Node 26.4.0 and pnpm 12.6.0. CI still pins Python 3.12 and Node 24. Hosted CI/container jobs and live Google credentials were not exercised; no push or deployment was made.

## Deliberately retained and limitations

- Some long/complex functions remain. The retained legacy replanner has estimated complexity 34, and quote workspace rendering 36; task construction, budget recovery and fallback parsing remain visible hotspots in the final inventory. Further abstraction was deferred to avoid broad changes to compatibility and quotation flows without a demonstrated benefit. This work does not claim every function is below 40 lines or complexity 10.
- Knip found no unused exports/dependencies after consolidation; Ruff found no unused Python imports. Reference/AST inspection found the removed unreachable validator. No additional asset or dependency removals were justified. Python dead-code review used inspection rather than a Vulture installation.
- The sole dependency exception is declaring already-resolved `axe-core@4.14.0` directly for browser tests. Knip correctly rejected an undeclared transitive import. Only its top-level lock importer was added; no resolved package version changed. Prettier configuration supports editors without adding another project dependency or a broad JSX formatting rewrite.
- Valid API fields and UI journeys, storage keys, signed-cookie policy, CSP/headers, quality thresholds, root Node pin, root/runtime Python requirements, `vercel.json` and Docker behavior were retained. Invalid non-finite/overflow/orphaned inputs now receive errors instead of server failures. Engine purity checks now cover file I/O and nested modules as well as network imports.
- Your initial staged planning-file deletions, `.gitignore` edit and pre-existing measurements remain outside these commits. The obsolete planning drafts were removed from the working tree; their already-staged deletions were preserved for your review. Generated intermediate artifacts from this task were moved under ignored `.tools/quality-evidence/`; selected before/after evidence is committed.

Review committed work with `git diff 499cb8f..codex/code-quality`; inspect your pre-existing staged changes separately with `git diff --cached`.

# Accessibility CI report

## What changed

- The browser smoke test waits for the active tab panel's Framer Motion opacity transition to finish before running axe. On GitHub, axe sampled the panel at partial opacity and reported several temporarily faded text colors below 4.5:1.
- The browser smoke test now includes axe's failing node selectors and failure summaries in assertion output, so future contrast failures identify the rendered node and color pair.
- Updated this phase audit and report with the hosted diagnosis and verification results as required by `AGENTS.md`.

## What was deliberately left alone

- No color tokens or card styling changed. The failure was caused by auditing during an entrance animation, so the test now waits for the rendered UI to reach its final opacity.
- The `color-contrast` rule and the existing keyboard-apply assertion remain enabled.
- Dependencies, lockfiles, backend code, runtime behavior, and deployment settings were not changed.

## Assumptions

- The desired outcome is a reliable accessibility check of the settled UI, with the existing entrance animation and axe contrast check kept intact.
- Waiting for the active tab panel opacity to reach 1 is sufficient to ensure its descendant text colors are no longer composited with the page background by the entrance animation.

## Verification

- `CI=true .venv/Scripts/python.exe scripts/check.py`: all 14 quality gates passed, including Playwright smoke (10/10).
- GitHub run [#15](https://github.com/avz-sharma/EvePlan/actions/runs/41349099264) confirmed the original failure was in the budget recovery axe assertion and reported the affected text nodes at partial opacity during the active tab's fade-in.

Run the same check in CI to verify the result:

```powershell
python scripts/check.py
```

If the hosted test fails again, its updated assertion will print the violating selector and axe failure summary so the rendered color pair can be fixed precisely.

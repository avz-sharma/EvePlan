# Accessibility CI report

## What changed

- The browser smoke test now includes axe's failing node selectors and failure summaries in assertion output. The GitHub log reported only the `color-contrast` rule ID, which did not identify the text or colors to correct.
- Added this phase audit and report to record the failing gate, investigation, assumptions, and verification path as required by `AGENTS.md`.

## What was deliberately left alone

- No color or card styling changed. The failure did not reproduce locally, including in the same bundled headless Chromium mode, so no specific foreground/background pair is supported by the available evidence.
- The `color-contrast` rule and the existing keyboard-apply assertion remain enabled.
- Dependencies, lockfiles, backend code, runtime behavior, and deployment settings were not changed.

## Assumptions

- The desired outcome is a reliable GitHub quality run, with axe's contrast check kept intact.
- The local Windows browser run cannot establish whether the original failure is Linux-specific or transient; the next hosted run is needed to confirm whether it persists.

## Verification

- `.venv/Scripts/python.exe scripts/check.py` with `CI=true`: all 14 quality gates passed, including Playwright smoke (10/10).
- The budget recovery test passed 10 consecutive repetitions in CI-mode headless Chromium.
- The user's GitHub output shows the backend checks, frontend lint/type checks, unused-code check, 61 frontend unit tests, production build, and package audit passing. The last smoke step passed 9/10 tests and failed only the budget recovery axe assertion with `color-contrast`.

Run the same check in CI to confirm the hosted result:

```powershell
python scripts/check.py
```

If the hosted test fails again, its updated assertion will print the violating selector and axe failure summary so the rendered color pair can be fixed precisely.

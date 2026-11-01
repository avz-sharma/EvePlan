# Accessibility CI audit

## Findings

1. GitHub's `python scripts/check.py` run passed the backend checks, frontend lint, unused-code check, 61 Vitest tests, production build, and package audit. The final Playwright smoke gate failed: 9 of 10 tests passed, while `budget recovery cards pass axe and apply from the keyboard` failed before its keyboard-apply assertions.
2. The failing assertion in `frontend/e2e/planner.spec.ts` expects an empty axe violation list. Axe reported only `color-contrast`; the pasted log does not include the failing node, foreground/background colors, or contrast ratio, so the source of the contrast failure still needs to be identified.
3. `frontend/src/components/TradeOffCards.tsx` styles the budget recovery cards with Tailwind color utilities. `frontend/tailwind.config.js` remaps those named color shades to application tokens, so the stock Tailwind shade names do not reveal the rendered color pair; the rendered styles and DOM target must guide the fix.
4. The test initially reduced axe results to rule IDs, which hid node-level diagnostics in the assertion output. The assertion now includes the failing node selector and axe failure summary so a repeated hosted failure identifies its rendered color pair.

## Assumptions

- The goal is to clear the hosted accessibility gate while preserving the budget-recovery card appearance, reduced-motion behavior, and keyboard application flow.
- Keep the `color-contrast` rule enabled and meet axe's actual contrast requirement; do not weaken or skip the assertion.
- Limit the change to the failing visual treatment and the minimum diagnostic or report updates needed to verify it.

## Reproduction outcome and follow-up

- The full shared check passed all 14 gates locally with `CI=true`, and the targeted budget recovery test passed 10 consecutive runs in Playwright's bundled headless Chromium.
- The GitHub failure did not reproduce on this Windows runner, so no exact failing node or foreground/background pair is available yet. No color change is justified by current evidence.
- Rerun hosted CI with the diagnostic assertion. If it fails again, use the reported selector and summary to correct the specific pair, then rerun the targeted test and all shared gates.

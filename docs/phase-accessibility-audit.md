# Accessibility CI audit

## Findings

1. GitHub's `python scripts/check.py` run passed the backend checks, frontend lint, unused-code check, 61 Vitest tests, production build, and package audit. The final Playwright smoke gate failed: 9 of 10 tests passed, while `budget recovery cards pass axe and apply from the keyboard` failed before its keyboard-apply assertions.
2. The failing assertion in `frontend/e2e/planner.spec.ts` expects an empty axe violation list. The first GitHub log omitted node details; after adding diagnostics and pushing a rerun, the hosted failure showed several text nodes on the third recovery card at roughly two-thirds opacity (for example, `#8d96aa` on `#fcfdff`, 2.91:1).
3. `frontend/src/components/TradeOffCards.tsx` styles the budget recovery cards with Tailwind color utilities. `frontend/tailwind.config.js` remaps those named color shades to application tokens, so the stock Tailwind shade names do not reveal the rendered color pair; the rendered styles and DOM target must guide the fix.
4. The reported targets are children of the active tab panel, which `frontend/src/App.tsx` wraps in a Framer Motion entrance transition from opacity 0 to 1. The reported text colors are consistent with that wrapper being sampled mid-transition; their settled token colors are darker and meet the contrast threshold.
5. The test initially reduced axe results to rule IDs, which hid node-level diagnostics in the assertion output. The assertion now includes the failing node selector and axe failure summary, making the hosted-only timing issue diagnosable.

## Assumptions

- The goal is to clear the hosted accessibility gate while preserving the budget-recovery card appearance, reduced-motion behavior, and keyboard application flow.
- Keep the `color-contrast` rule enabled and meet axe's actual contrast requirement; do not weaken or skip the assertion.
- Limit the change to stabilizing the accessibility assertion and the minimum diagnostic or report updates needed to verify it.

## Reproduction outcome

- The full shared check passed all 14 gates locally with `CI=true`, and the targeted budget recovery test passed 10 consecutive runs in Playwright's bundled headless Chromium.
- The GitHub failure did not reproduce on this Windows runner, even after 10 consecutive targeted runs. The diagnostic hosted rerun shows the failure comes from running axe while the tab's entrance opacity animation is still in progress; the colors are composited toward the light background and temporarily fail contrast.
- The minimal fix is to wait for the active tab panel's entrance opacity to reach 1 before running axe. Keep the production animation, color tokens, contrast rule, and keyboard assertion intact.

# Phase 1 report

## What changed

- Replaced the long stacked screen with a sticky header, URL-hash tabs, roving keyboard navigation, lazy tab panels, a persistent plan summary, and one shared change input. New tabs can be added in `frontend/src/tabs.config.ts`.
- Added a light token palette, 8 px spacing steps, and a defined type scale in `frontend/src/index.css` and Tailwind config. Added glass fallbacks for unsupported backdrop filters, reduced transparency, and increased contrast. Elder-Friendly Mode scales the root font size.
- Added shared UI primitives for panels, tabs, stats, chips, button variants, icon buttons, dialogs, tooltips, skeletons, empty states, banners, and toasts. Dialogs trap focus, restore prior focus, and close with Escape.
- Moved the existing planner features into Overview, Budget, Timeline, Scenarios, Quotes, and How it works tabs. Added accessible budget and quote tables, compact INR formatting, top critical tasks, plan history, inline retry states, and undo/fork toasts.
- Corrected budget bars to use the total plan budget as the scale, with the contingency segment immediately after each row's maximum. Added a pure `layoutDag()` helper, fit-to-width SVG rendering, wrapped task labels, critical-task emphasis, and a separate route for long dependency edges.
- Quick scenario chips load the committed examples from the existing backend route and retain local deterministic examples when that route is unavailable.
- Replaced hard-coded localhost API URLs with `VITE_API_BASE_URL`, added it to `.env.example`, and added a root API Dockerfile plus static-host and Cloud Run notes.
- Split the onboarding and quote result interfaces into focused components; all React component files are now under 200 lines.
- Added a focused unit test for timeline layout behavior. No backend source was edited.

## Contrast measurements

Calculated WCAG contrast ratios from the CSS token RGB values. The glass measurement composites a 68% white surface over the warm page color (`rgb(247, 245, 240)`), yielding approximately `rgb(252, 252, 250)`. All listed foreground/background pairs exceed 4.5:1.

| Foreground token | On glass | On white |
| --- | ---: | ---: |
| Ink | 12.99:1 | 13.35:1 |
| Muted | 6.16:1 | 6.33:1 |
| Accent | 7.59:1 | 7.79:1 |
| Gold | 6.40:1 | 6.57:1 |
| Success | 6.40:1 | 6.57:1 |
| Warning | 5.89:1 | 6.05:1 |
| Danger | 6.63:1 | 6.82:1 |

Semantic text on its soft token background: gold 5.92:1, success 5.73:1, warning 5.34:1, danger 5.79:1, and accent 6.68:1.

These are token calculations, not an axe or browser audit. The browser manual check should confirm rendered text and state combinations.

## Verification

- `pnpm run lint` — passed.
- `pnpm run build` — passed.
- `pnpm run test` — passed, 8 tests across 3 files.
- `python -m pytest` in `backend/` — passed, 32 tests.
- No browser screenshots, axe scan, keyboard-only pass, or responsive measurements were recorded here. The user plans to verify the UI manually.
- The Docker image was not built or deployed in this phase.

## Assumptions and limits

- The project has no Fontsource package installed. The plan also permits no new dependency except Radix primitives, so this phase uses system serif and sans stacks to avoid adding a conflicting dependency or external font request.
- The existing `/api/plan/fixtures` endpoint returns committed `PlanDelta` examples, rather than complete validated plan outputs. The UI marks those committed examples as saved; producing persisted full-plan outputs would require backend work, which the acceptance criteria prohibit for this phase.
- There is no live deployment URL yet; the README records that the first deployment is pending instead of inventing a URL.
- The screenshot notes about the exact “Budget Equilibrium Maintained” banner and some exact labels were not all present in source; the audit records those as unconfirmed. The misleading budget buffer and graph layout issues were confirmed and corrected.
- The workspace already contained deleted tracked plan documents and untracked application files before this phase. No commits were created because staging or committing the current tree would include unrelated pre-existing workspace state.

## Deliberately left for manual review

- Check each tab at 360, 768, 1280, and 1920 px for overflow and reflow; test glass fallbacks, the quote/onboarding dialogs, hash deep links, and keyboard paths.
- Run axe on each tab and confirm the computed contrast pairs in the rendered browser. Save the requested screenshots under `docs/screenshots/phase1/` after visual review.

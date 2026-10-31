# Phase 1 audit

## Scope and assumptions

- Audit covers the existing React/Vite frontend and the UI-facing paths named in `rules.md`. The backend is outside this phase and must remain unchanged.
- `rules.md` is treated as the requested Phase 1 acceptance plan. The pasted screenshot notes are treated as hypotheses to confirm in source.
- Existing workspace state includes deleted plan documents and untracked application files before this audit; those changes are pre-existing and are not part of this phase.

## Confirmed issues

- `frontend/src/App.tsx` is a single 400+ line component that owns plan loading, undo/redo, branching, command streaming, trade-offs, modal state, and the entire page layout. All current features render in one long vertical stack, with no tab navigation or URL state.
- The app hard-codes dark slate and amber classes throughout. `index.css` only contains elder mode and dark scrollbar styling; `tailwind.config.js` enables class-based dark mode and keeps a separate palette, so there is no single design token source.
- Most cards, buttons, dialogs, and status surfaces have repeated one-off Tailwind class strings. There is no shared UI primitive layer.
- User-facing copy includes internal names in `App.tsx`, `BudgetAllocationBars.tsx`, `CascadeGraphView.tsx`, `ElderHeaderToggle.tsx`, and `AuditDeltaDrawer.tsx` (including LAW labels, phase/demo language, quota/evaluation framing, and raw engine terminology).
- `BudgetAllocationBars.tsx` scales bars against the largest category rather than the total plan budget, draws the base as a single maximum allocation, and gives the contingency its own fixed-width segment at the end of the track. Amounts sit in a flexible row rather than a consistent right-aligned amount column. This confirms the misleading buffer placement described in the pasted notes.
- `CascadeGraphView.tsx` computes depth recursively and positions every node in fixed-size columns and rows. The SVG canvas has a fixed content width inside `overflow-x-auto`; titles are one-line clamped; edges are drawn on a full-canvas SVG under HTML nodes without routing around them. This confirms the clipped/scrolling graph and truncated titles risks from the pasted notes.
- `ElderHeaderToggle.tsx` displays backend status as a persistent header status block. `App.tsx` uses developer-oriented progress/status messages and does not have a calm, separate degraded-mode state or toast pattern.
- The existing graph honors reduced motion, but other interactions and the app shell have no shared reduced-motion policy. Focus styling is inconsistent, and modal markup is hand-built without an evident shared dialog/focus management primitive.
- The app initializes by making a direct request to `127.0.0.1:8000`; it can render a retry screen when that fails but has no saved frontend baseline fixture or overview empty state.
- There are only two frontend tests, covering trade-offs and the cascade graph; there are no tests or source files for navigation, tabs, shared primitives, or budget bar geometry.
- The screenshot claims about a full-width “Budget Equilibrium Maintained” banner and exact current appearance cannot be verified from the supplied source because that exact copy is absent; those claims remain unconfirmed.

## Planned implementation order

1. Establish CSS design tokens and accessible global defaults.
2. Add reusable UI primitives and migrate the app shell and existing feature components.
3. Re-home current functionality under registry-driven, hash-addressable tabs with shared summary and command controls.
4. Fix budget and timeline visualization behavior while preserving the existing planning logic.
5. Clean user-facing copy and document remaining verification limits.

## Assumptions

- The source contains no product requirements for an Events or Vendors tab yet; the tab registry will support adding them without shipping empty tabs.
- The current project has no self-hosted font package or font assets. Since `rules.md` permits only Radix as a new dependency, typography will use system serif/sans stacks unless a bundled font is already available.
- Browser-driven screenshots, axe scans, and manual keyboard checks require a running browser session. These will be recorded as unverified if no browser automation is available in this environment.

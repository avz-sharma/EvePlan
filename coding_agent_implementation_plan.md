# Coding Agent Implementation Plan & Guardrail Protocol
**Project:** Celebration & Event Planner — Multi-Generational Indian Family Wedding Edition  
**Challenge Reference:** [PromptWars Virtual – Challenge 5 Explainer Session](https://www.youtube.com/watch?v=fdi63eSyyYM)  
**Target Stack:** Python 3.12 (`FastAPI`, `Pydantic v2`, `google-genai`) + React 18 (`Vite`, `Framer Motion`, `Tailwind CSS`, `openapi-typescript`)

## 1. Non-Negotiable Agent Guardrails & Anti-Hallucination Protocols

You are an autonomous coding agent building a graded hackathon submission that will be scored by a static AI code evaluator on **Problem Statement Alignment**, **Code Quality**, **Security**, **Efficiency**, **Testing**, and **Accessibility**. You must obey the following seven laws at all times:

| Protocol ID | Rule Name | Strict Enforcement Mechanism | Forbidden Behavior (Immediate Failure) |
| :--- | :--- | :--- | :--- |
| **LAW-01** | **LLM Extracts, Code Computes** | All budget arithmetic, per-plate scaling, 10% contingency buffers, DAG topological sorting, Critical Path Method (CPM) slack calculation, and trade-off recovery options MUST execute inside `backend/app/engine/`. | Importing `google.genai`, `httpx`, or any network/LLM client inside `backend/app/engine/`, or letting the LLM compute, sum, or estimate currency totals. |
| **LAW-02** | **Single Source of Truth Types** | Define all state and API contracts in `backend/app/schemas/` using `Pydantic v2` with `model_config = ConfigDict(extra="forbid")`. Generate frontend types exclusively via `npx openapi-typescript`. | Hand-writing duplicate TypeScript interfaces that drift from backend Pydantic schemas, or using `any` / `@ts-ignore`. |
| **LAW-03** | **Zero Fabricated Vendor Prices** | Every budget figure must be presented as a range (`min_inr`, `max_inr`) with an explicit `10%` contingency buffer and visible assumption chips. Vendor counter-offers must be computed strictly from uploaded quote deltas vs. user budget caps. | Inventing "typical market rates," outputting single fake confirmed vendor prices, or allowing Gemini to invent card layouts or numerical fields. |
| **LAW-04** | **UI & Animation Constraint** | Use **React + Framer Motion (`framer-motion`) only** for layout transitions (`layout`, `layoutId`), budget bar springs, and SVG/DOM cascade dependency ripples. Animate only `transform` and `opacity`, and honor `useReducedMotion()`. | Installing secondary heavy graph or animation libraries (`reactflow`, `gsap`, `three`, `d3`), or animating layout-thrashing CSS properties (`width`, `height`, `top`, `left`). |
| **LAW-05** | **Environment & Model Hygiene** | Load `GEMINI_API_KEY` and `GEMINI_MODEL` via `pydantic-settings` in `backend/app/config.py`, defaulting `GEMINI_MODEL` to [`gemini-3.8-flash`](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). | Hardcoding deprecated model strings (such as `gemini-2.5-flash` or `gemini-1.5-flash`) in business logic, or exposing any key with a `VITE_` prefix to the browser. |
| **LAW-06** | **Untrusted Upload & Prompt Defense** | Validate uploaded quote files by magic bytes (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`), cap size at `5 MB` and PDF length at `3 pages`, process in-memory (`io.BytesIO`) with zero disk retention, and wrap user text inside `<untrusted_user_input>` tags. | Saving user uploads to disk, trusting client `Content-Type` headers without magic-byte inspection, or concatenating raw user strings into system instructions. |
| **LAW-07** | **Phase-Gate Execution Loop** | Execute one phase at a time. At the end of each phase, run its mandatory verification commands (`pytest`, `ruff`, `mypy --strict`, `vitest`). Fix all errors before starting the next phase. | Proceeding to the next phase while tests fail, skipping test creation, or leaving stubbed `TODO` / `pass` blocks in production modules. |

## 2. Target Repository Architecture

Create and maintain this exact directory structure so static repository scanners immediately verify modularity and rubric alignment:

```text
celebration-planner/
├── REQUIREMENTS.md                      # Traceability matrix: Brief -> Module -> Test
├── README.md                            # Architecture diagram, setup, 2-min demo script
├── .env.example                         # GEMINI_API_KEY=, GEMINI_MODEL=gemini-3.8-flash
├── .github/workflows/ci.yml             # ruff, mypy --strict, bandit, gitleaks, pytest, vitest
├── backend/
│   ├── pyproject.toml                   # FastAPI, pydantic, google-genai, pypdf, pytest, ruff, mypy
│   ├── app/
│   │   ├── main.py                      # FastAPI app, locked-down CORS, rate limiter, OpenAPI export
│   │   ├── config.py                    # pydantic-settings Settings class
│   │   ├── schemas/
│   │   │   ├── plan_state.py            # SubEvent, BudgetBucket, TaskNode, WeddingPlan
│   │   │   ├── intent_delta.py          # PlanDelta, CascadeDiff, TradeOffOption
│   │   │   └── vendor_quote.py          # NormalizedQuote, QuoteComparison, HiddenCostFlag
│   │   ├── engine/                      # PURE DETERMINISTIC PYTHON (Zero LLM imports)
│   │   │   ├── budget_tradeoffs.py      # Range math, 10% contingency, 3 recovery options
│   │   │   ├── dependency_scheduler.py  # Kahn's topological sort, CPM critical path & slack
│   │   │   ├── cascade_replanner.py     # Applies PlanDelta -> WeddingPlan, computes CascadeDiff
│   │   │   ├── conflict_rules.py        # Elderly accessibility, dietary splits, ceremony buffers
│   │   │   └── vendor_comparator.py     # Per-head normalization, missing items, counter-offer math
│   │   ├── services/
│   │   │   ├── gemini_extractor.py      # google-genai structured extraction + SHA-256 state cache
│   │   │   ├── upload_validator.py      # Magic-byte validator, 5MB limit, 3-page PDF cap (BytesIO)
│   │   │   └── fallback_parser.py       # Deterministic regex/rule fallback if Gemini call fails
│   │   ├── prompts/
│   │   │   ├── v1_intent_delta.txt      # Versioned prompt for natural language -> PlanDelta
│   │   │   ├── v1_tradeoff_rationale.txt# Versioned prompt for explaining engine TradeOffOptions
│   │   │   └── v1_quote_extraction.txt  # Defensive multimodal prompt for vendor quotes
│   │   └── routers/
│   │       ├── onboarding_router.py     # Initial persona intake & baseline plan creation
│   │       ├── replan_router.py         # SSE endpoint: streams delta -> engine_diff -> rationale
│   │       └── vendor_router.py         # Multimodal quote extraction & side-by-side comparison
│   └── tests/
│       ├── test_budget_tradeoffs.py     # Tests per-head scaling, contingency, recovery options
│       ├── test_dependency_dag.py       # Tests topological sort, cycle detection, slack shifts
│       ├── test_cascade_replanner.py    # Tests 80->120 guest surge & sub-event inheritance
│       ├── test_upload_security.py      # Tests oversized files, spoofed MIME, prompt injection
│       └── test_gemini_fallback.py      # Mocked LLM tests + graceful degradation verification
└── frontend/
    ├── package.json                     # react, framer-motion, tailwindcss, openapi-typescript, vitest, jest-axe
    ├── src/
    │   ├── api/
    │   │   ├── schema.d.ts              # AUTO-GENERATED via openapi-typescript (DO NOT EDIT)
    │   │   └── sseClient.ts             # Typed SSE reader + optimistic state dispatcher
    │   ├── components/
    │   │   ├── ChaosDemoPills.tsx       # 4 1-click scenario triggers for instant evaluation
    │   │   ├── CascadeGraphView.tsx     # SVG + Framer Motion DAG with staggered hop animation
    │   │   ├── BudgetAllocationBars.tsx # Framer Motion layout bars with hover simulation preview
    │   │   ├── TradeOffCards.tsx        # Engine options + hover preview + 1-click apply
    │   │   ├── ScenarioBranchCompare.tsx# Plan A vs Plan B fork comparison + undo history
    │   │   ├── VendorQuoteModal.tsx     # Snap-a-Quote dropzone, normalized matrix, negotiation script
    │   │   └── AuditDeltaDrawer.tsx     # Developer/Evaluator JSON Delta & Engine Diff inspector
    │   └── __tests__/
    │       ├── CascadeView.test.tsx     # Vitest + jest-axe accessibility & rendering checks
    │       └── TradeOffSim.test.tsx     # Verifies hover preview updates without LLM round-trip
```

## 3. Phase-Wise Implementation Plan

### Phase 1: Pydantic Schemas & Pure-Python Deterministic Engine
**Objective:** Build the domain model for a multi-generational Indian family wedding (*Haldi*, *Sangeet*, *Wedding Ceremony*, *Reception*) and the 100% deterministic math/DAG engine.

1. **Implement `backend/app/schemas/plan_state.py` & `intent_delta.py`:**
   * Define `SubEventType` (`HALDI`, `SANGEET`, `WEDDING`, `RECEPTION`), `DietarySplit` (`regular`, `jain`, `vegan`, `kids`), and `AccessibilityNeeds` (`elderly_count`, `wheelchair_access_required`, `ground_floor_dining`).
   * Define `BudgetBucket` (`category`, `allocated_min_inr`, `allocated_max_inr`, `contingency_inr`, `assumptions: list[str]`, `is_violated: bool`).
   * Define `TaskNode` (`id`, `title`, `category`, `sub_event`, `duration_days`, `dependencies: list[str]`, `status`, `earliest_start`, `latest_start`, `slack_days`, `is_critical: bool`).
   * Define `PlanDelta` with `ConfigDict(extra="forbid")` representing structured changes (`guest_count_delta`, `sub_event_filter`, `budget_cap_inr`, `days_until_event_delta`, `venue_capacity_override`, `new_constraints: list[str]`).
2. **Implement `backend/app/engine/` modules:**
   * `dependency_scheduler.py`: Implement Kahn's topological sort (raising `CyclicDependencyError` on cycles) and forward/backward pass Critical Path Method (CPM) to compute `slack_days` and mark `is_critical = (slack_days == 0)`.
   * `budget_tradeoffs.py`: Compute category allocations with an explicit `10%` contingency reserve. When `total_projected_max > total_budget_cap`, deterministically generate 3 `TradeOffOption` objects (e.g., *Option 1: Trim Reception guest list by N; Option 2: Downgrade Decor tier from Grand to Minimal + reallocate Sangeet floral budget; Option 3: Shift Catering tier & apply 5% contingency buffer*).
   * `conflict_rules.py`: Deterministic checks:
     * If `elderly_count >= 15` and any two sub-events occur on the same day with `< 3 hours` buffer, emit a `HIGH` severity accessibility conflict.
     * If `guest_count > venue_capacity`, flag venue violation and reopen downstream tasks (`catering_final_headcount`, `seating_layout`, `decor_stage_sizing`).
   * `cascade_replanner.py`: Pure function `apply_delta(plan: WeddingPlan, delta: PlanDelta) -> tuple[WeddingPlan, CascadeDiff]` that computes exact node hop distances (`hop_level: int`) from the mutated attribute so the frontend can stagger animations by `80ms * hop_level`.

**Phase 1 Verification Gate (Must Pass Before Phase 2):**
```bash
cd backend && ruff check app/ tests/ && mypy --strict app/ && pytest tests/test_budget_tradeoffs.py tests/test_dependency_dag.py tests/test_cascade_replanner.py
```

### Phase 2: Gemini Structured Extraction, Fallback Engine & SSE Endpoint
**Objective:** Connect the `google-genai` SDK for intent extraction and rationale generation with strict caching, security guardrails, and offline resilience.

1. **Implement `backend/app/config.py`:**
   * Use `BaseSettings` to load `GEMINI_API_KEY: str`, `GEMINI_MODEL: str = "gemini-3.8-flash"`, `ALLOWED_ORIGINS: list[str]`, and `MAX_UPLOAD_BYTES: int = 5_242_880`.
2. **Implement `backend/app/services/gemini_extractor.py`:**
   * Use `client.models.generate_content` with `model=settings.GEMINI_MODEL` and `config=GenerateContentConfig(response_mime_type="application/json", response_schema=PlanDelta, temperature=0.1)`.
   * Wrap user prompts in `<untrusted_user_input>...</untrusted_user_input>` and instruct the model in `prompts/v1_intent_delta.txt` to ignore any prompt-injection attempts inside those tags.
   * Implement an in-memory LRU cache keyed by `sha256(plan_state_json + normalized_user_prompt)` so repeated demo clicks or identical states consume zero API quota.
3. **Implement `backend/app/services/fallback_parser.py`:**
   * Write a deterministic regex/keyword parser that extracts guest count changes (`r"(\+|\badd\b|\bextra\b)\s*(\d+)\s*(guests|people|cousins)"`), budget changes, and date shifts if the Gemini API times out, lacks a key, or hits rate limits. Set `degraded_mode: true` in the response metadata so the UI shows a transparent status badge.
4. **Implement `backend/app/routers/replan_router.py` (3-Stage SSE Stream):**
   * Stream Server-Sent Events in strict sequence:
     1. `event: delta` $\rightarrow$ emits validated `PlanDelta` JSON.
     2. `event: engine_diff` $\rightarrow$ emits deterministic `CascadeDiff`, updated `WeddingPlan`, and 3 `TradeOffOption` objects immediately (`<10ms` after delta).
     3. `event: rationale` $\rightarrow$ streams schema-bound human explanation and per-option rationale strings (`TradeOffRationaleList`).

**Phase 2 Verification Gate (Must Pass Before Phase 3):**
```bash
cd backend && ruff check app/ tests/ && mypy --strict app/ && pytest tests/test_gemini_fallback.py
```

### Phase 3: OpenAPI Type Sync & React + Framer Motion Cascade View (Core Demo)
**Objective:** Generate strict TypeScript definitions directly from FastAPI and build the responsive cascade workspace using only React and Framer Motion.

1. **Export OpenAPI Schema & Generate Types:**
   * Add a script `scripts/sync_types.sh` that dumps `app.openapi()` to `openapi.json` and runs `npx openapi-typescript ../backend/openapi.json -o src/api/schema.d.ts`.
2. **Build `CascadeGraphView.tsx` (React + SVG + Framer Motion Only):**
   * Render tasks as accessible cards positioned in topological columns (`Column 0: Venue & Dates` $\rightarrow$ `Column 1: Vendors & Menus` $\rightarrow$ `Column 2: Logistics & Invitations` $\rightarrow$ `Column 3: Day-Of Execution`) connected by SVG `<motion.path>` Bezier curves.
   * When an `engine_diff` SSE event arrives, animate affected task cards and SVG dependency edges using `transition={{ delay: node.hop_level * 0.08, type: "spring", stiffness: 260, damping: 25 }}`.
   * Respect `const shouldReduceMotion = useReducedMotion()` from `framer-motion`: if true, set all transition durations and delays to `0`.
3. **Build `ChaosDemoPills.tsx` & `AuditDeltaDrawer.tsx`:**
   * Place 4 one-click scenario pills above the prompt input:
     * *"Cousin bringing 40 extra guests + needs Jain counter"*
     * *"Venue garden lost due to rain forecast — move Haldi indoors"*
     * *"Wedding date moved 2 weeks earlier"*
     * *"Caterer increased per-plate rate by ₹250"*
   * Add a collapsible **"Verify Architecture (JSON Delta vs. Engine Math)"** drawer showing the raw `PlanDelta` alongside the deterministic `CascadeDiff` for evaluators.

**Phase 3 Verification Gate (Must Pass Before Phase 4):**
```bash
./scripts/sync_types.sh && cd frontend && npm run lint && npx tsc --noEmit && npx vitest run src/__tests__/CascadeView.test.tsx
```

### Phase 4: Trade-Off Cards with Instant Hover Simulation & Scenario Branching
**Objective:** Let users explore trade-offs interactively at 60fps with zero LLM wait time and compare forked plans side by side.

1. **Build `BudgetAllocationBars.tsx` & `TradeOffCards.tsx`:**
   * Render each budget category bar using Framer Motion `<motion.div layout>` displaying the base range, the `10%` contingency buffer segment, and clickable assumption chips (`"Assumes 60% Sangeet attendance"`, `"Includes 10% unallocated buffer"`).
   * When the user hovers or focuses (`onMouseEnter` / `onFocus`) on any of the 3 `TradeOffOption` cards, immediately set `previewOptionId` in React state. Compute the preview bar widths client-side from the pre-calculated `TradeOffOption.bucket_adjustments` so the budget bars animate smoothly to their healed state before the user clicks **"Apply Trade-Off"**.
2. **Build `ScenarioBranchCompare.tsx`:**
   * Allow users to click **"Fork Current Plan (Plan A vs. Plan B)"** and maintain an immutable state history stack (`undo` / `redo`) so mid-flight changes never force a restart from scratch.

**Phase 4 Verification Gate (Must Pass Before Phase 5):**
```bash
cd frontend && npm run lint && npx tsc --noEmit && npx vitest run src/__tests__/TradeOffSim.test.tsx
```

### Phase 5: Multimodal "Snap-a-Quote" Extraction & Guardrailed Negotiation Co-Pilot
**Objective:** Allow users to upload vendor PDF/image quotes or paste text, normalize per-head costs deterministically, flag missing items, and generate grounded counter-offers.

1. **Implement `backend/app/services/upload_validator.py`:**
   * Inspect the first 8 bytes of uploaded files (`%PDF-`, `\xff\xd8\xff`, `\x89PNG\r\n\x1a\n`, `RIFF....WEBP`). Reject any mismatch with HTTP `415`.
   * Enforce `len(content) <= 5_242_880` (HTTP `413` if exceeded). For PDFs, read from `io.BytesIO(content)` with `pypdf.PdfReader` and reject if `len(reader.pages) > 3`. Never write uploaded bytes to disk.
2. **Implement `backend/app/engine/vendor_comparator.py` & `routers/vendor_router.py`:**
   * Extract raw line items into `NormalizedQuote` via Gemini multimodal structured output.
   * Run deterministic Python checks in `vendor_comparator.py` to calculate true per-head cost across guest counts, flag missing standard Indian wedding inclusions (`gst_18_percent_included`, `generator_backup_included`, `jain_counter_included`, `bartender_corkage_included`), and compute the exact `target_counter_offer_inr` required to fit within the user's `BudgetBucket` cap.
   * Pass only the verified discrepancy list and `target_counter_offer_inr` to Gemini to draft a polite WhatsApp/Email negotiation message and 5 targeted vendor interview questions.

**Phase 5 Verification Gate (Must Pass Before Phase 6):**
```bash
cd backend && ruff check app/ tests/ && mypy --strict app/ && pytest tests/test_upload_security.py
```

### Phase 6: Accessibility, Traceability Matrix & CI Hardening
**Objective:** Maximize static evaluator scores across Accessibility, Security, Testing, and Problem Statement Alignment.

1. **Accessibility & Elder-Friendly Mode:**
   * Add an **Elder-Friendly View toggle** (`125%` root font scaling + high-contrast WCAG AAA palette) in the top header.
   * Mark SSE status and cascade summary banners with `role="status"` and `aria-live="polite"`.
   * Run `jest-axe` automated accessibility assertions inside `frontend/src/__tests__/CascadeView.test.tsx`.
2. **Create `REQUIREMENTS.md` & `.github/workflows/ci.yml`:**
   * Populate `REQUIREMENTS.md` with a markdown table mapping every requirement from the [Challenge 5 Explainer Session](https://www.youtube.com/watch?v=fdi63eSyyYM) (Onboarding, Budget Trade-offs, Dependency Scheduling, Adaptive Re-planning, Vendor Coordination, Demographic Personalization) to its exact backend module, frontend component, and test file.
   * Configure `.github/workflows/ci.yml` to run `ruff check`, `mypy --strict`, `bandit -r app/`, `pytest`, `npx tsc --noEmit`, and `npx vitest run`.

**Phase 6 Final Verification Gate:**
```bash
cd backend && ruff check app/ tests/ && mypy --strict app/ && bandit -r app/ && pytest && cd ../frontend && npm run lint && npx tsc --noEmit && npx vitest run
```

## 4. Coding Agent Pre-Commit Self-Audit Checklist

Before declaring the build complete, the coding agent must verify every item below:

- [ ] `grep -rn "gemini-2.5" backend/ frontend/` returns **0 matches** (model is loaded via `settings.GEMINI_MODEL` defaulting to `gemini-3.8-flash`).
- [ ] `grep -rn "google.genai" backend/app/engine/` returns **0 matches** (`engine/` is 100% pure deterministic Python).
- [ ] `grep -rn "VITE_GEMINI" frontend/ .env*` returns **0 matches** (API keys exist strictly on the backend).
- [ ] `frontend/src/api/schema.d.ts` matches the current FastAPI `/openapi.json` schema with zero manual edits.
- [ ] All 4 **Chaos Demo Pills** work both with a live Gemini key and when `GEMINI_API_KEY` is unset (graceful fallback mode).
- [ ] All `pytest` and `vitest` (including `jest-axe`) suites pass with exit code `0`.

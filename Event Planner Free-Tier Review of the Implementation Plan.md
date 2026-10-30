# Event Planner: Free-Tier Review of the Implementation Plan

Review of `coding_agent_implementation_plan.md` for the GenAI celebration planner (FastAPI + React/Vite/Framer Motion), focused on running entirely on free-tier APIs.

## Verdict

The plan is well structured, and the rule that the engine never imports an LLM client is the right backbone. But it is written as if quota were unlimited. On the free tier, its default setup would run out after about ten demo clicks, and a few details contradict each other.

## 1. Changes needed for free-tier operation

### Quota is the main problem

- Third-party trackers report that the Gemini API free tier allows about 20 requests per day for Gemini 3.8 Flash, versus about 500 per day for the Flash-Lite models. The RPM figures reported alongside are about 5 for 3.8 Flash and 10 for Flash-Lite.
- Google publishes no fixed table. The real numbers appear on your project's AI Studio rate-limit page, so check that page before you build.
- The plan defaults to `gemini-3.8-flash`, and each replan makes two calls (delta, then rationale). That is roughly 10 replans per day across every visitor and tester.

### Fixes, in order of impact

1. **Default to a Flash-Lite model.** Keep `GEMINI_MODEL` configurable and add a `GEMINI_FALLBACK_MODEL`. Flash-Lite is plenty for intent extraction and quote parsing.
2. **One LLM call per replan.** Generate rationale text from deterministic templates filled with engine facts, and make the LLM-written explanation an optional "Explain with AI" action. Do the same for the negotiation message: template first, LLM polish on request.
3. **Ship fixtures for the 4 demo pills.** Generate each pill's real `PlanDelta` once, validate it, commit it to `backend/app/fixtures/`, and serve it with a "cached" badge in the audit drawer. The demo then costs zero quota and works even when the API is down. This is honest as long as it is labeled.
4. **Add a quota guard.** A small in-process token bucket respecting RPM, a daily counter, and 429/`Retry-After` handling that flips to `degraded_mode` instead of erroring. The plan's per-instance rate limiter does not protect your daily Gemini budget.
5. **Lower the thinking level for extraction.** Thinking tokens count against the same limits as output, so check the SDK docs for the exact parameter.
6. **Cap prompt length** (around 500 characters, enforced in Pydantic) so one user cannot burn your token quota.

### Privacy

Google uses free-tier content to improve its products. Add a notice in the upload modal and README, and strip phone numbers and emails client-side before sending anything.

### Hosting

The plan has no persistence or deployment story, which is itself a gap (see section 3).

- **Backend on Cloud Run.** The free allowances are 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month. The allowance is applied per billing account, so you still need a billing account linked. Set max-instances low and add a budget alert. With scale-to-zero, cold starts take roughly 1-5 seconds, so the UI should show a warm-up state.
- **Frontend as static files** on any free static host.
- **No database.** Keep plan state and undo history on the client (localStorage/IndexedDB) and POST the state with each replan. This fits the stateless backend and your in-memory cache, and it avoids Supabase pausing on you. Validate state size and field lengths server-side.

## 2. Contradictions and bugs in the plan

- **The key is required, but the app must run without it.** `GEMINI_API_KEY: str` crashes at startup when unset, which contradicts the self-audit checklist. Make it an optional `SecretStr | None`.
- **The fallback regex fails the first demo pill.** It expects "extra" followed by a number, but the pill says "40 extra guests." Accept both orders: `(\d+)\s*(?:extra|more|additional)?\s*(guests|people|cousins|relatives)`. The spec also covers only guest counts, while the four pills need parsing for per-plate increases, date shifts, and venue loss too.
- **LAW-04 forbids animating `width`, but Phase 4 animates bar widths.** Draw the bars with `scaleX` and a left transform-origin, with labels outside the scaled element.
- **`extra="forbid"` may not survive as an LLM schema.** Gemini's structured-output schema subset has historically rejected some JSON-Schema keywords, so verify against the current SDK. The safer pattern is a flat LLM-facing model (`PlanDeltaLLM`) that you re-validate into the strict internal `PlanDelta`.
- **LAW-03 has no source for baseline numbers.** The engine needs per-plate rates and category splits, and hardcoding them is exactly the fabrication the law forbids. Ask for the per-plate range at onboarding, and keep the allocation percentages in one documented config file labeled "planning heuristic, not market price."

## 3. Gaps against the brief

- **No deployment phase.** The brief requires a deployed web app, so add a Phase 0 walking skeleton: Dockerfile, deploy, smoke test, live URL in the README. Deploy problems surface late otherwise.
- **No onboarding UI, timeline/checklist view, or personalized ideas.** The component list covers the cascade and vendor features but not "context-aware onboarding," the milestone checklist, or the "personalized ideas" in the main problem statement. Add an `OnboardingWizard`, a `TimelineChecklist`, and one cached ideas card per sub-event.
- **The SVG cascade graph needs a non-visual equivalent.** Add an ordered list of affected tasks with hop levels and a keyboard-focus order that follows the topological sort.
- **`REQUIREMENTS.md` should map to the brief's own text,** not the YouTube link, because an automated evaluator cannot watch a video.
- **Rename `WeddingPlan` to `EventPlan`** with a `template` field. The brief mentions birthdays and community events, and this shows extensibility cheaply.

## 4. Cheap hardening additions

- An **architecture test** (`test_architecture.py`) that parses `engine/` with `ast` and fails on any network or LLM import. It enforces LAW-01 in CI instead of leaving it to a `grep`.
- `pip-audit` and `npm audit` in CI, plus `pytest --cov-fail-under`.
- `React.lazy` for the vendor modal and audit drawer, since they are rarely used.
- A test asserting that no outbound call happens when the API key is unset.
- The animation library now ships as `motion` (import from `motion/react`); `framer-motion` still works, so pick one and pin it.
- Verify the `gemini-3.8-flash` doc link in the plan before shipping it.

## Suggested first moves

1. Phase 0: walking skeleton deployed to Cloud Run with a static frontend.
2. Quota guard and degraded mode, so every later feature inherits graceful failure.
3. Fixtures for the four demo pills, then the engine and cascade view.

## Sources

- Gemini API free tier limits (third-party tracker): https://www.scriptbyai.com/gemini-api-free-tier-limits/
- Gemini API pricing and free-tier notes: https://blog.laozhang.ai/en/posts/gemini-api-pricing.md
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud Run free tier per billing account: https://cloudchipr.com/blog/cloud-run-pricing
- Cloud Run cold-start note: https://cloudtoolstack.com/tools/gcp-cloud-run-cost-estimator

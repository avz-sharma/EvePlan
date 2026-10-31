# Phase 2 Audit

## Scope

Audit performed before Phase 2 implementation. The current product uses a wedding-specific `EventPlan`, a one-shot onboarding form, a deterministic cascade engine, client-side saved state, and a vendor quote upload/comparison flow.

## Findings

### Event model and builder

- `backend/app/schemas/plan_state.py` represents `EventPlan` with a single global guest count and `days_until_event`; it has no `days[]` or per-event catalog/custom event records. Task nodes refer to the closed `SubEventType` enum.
- `backend/app/routers/onboarding_router.py` contains the hardcoded Sharma-Verma wedding name, wedding ceremonies, budget percentages, and task DAG inline. It is not a reusable pure builder and has no calendar dates or event-relative lead times.
- `backend/app/engine/cascade_replanner.py` mutates one plan-wide guest count and hardcodes task IDs such as `task_venue_booking`, `task_haldi_decor`, and catering tasks. It cannot isolate an event's guest-count effects or remove/rebuild event-specific tasks.
- There is no event catalog data file. The repository contains no Appendix A source text; the implementation will use the events named in the request as a conservative starter catalog and label it for community review.
- Existing `backend/app/engine/dependency_scheduler.py` is reusable for DAG validation/scheduling, but its schedule is project-relative and the builder needs event-date offsets and per-event task IDs.
- `backend/tests/test_architecture.py` guards forbidden network/framework imports in the engine. New builder code must stay under this boundary.

### Onboarding and plan navigation

- `frontend/src/components/OnboardingWizard.tsx` is a single modal form with wedding-specific defaults, not a day/event-first multi-step wizard.
- `frontend/src/components/OnboardingFields.tsx` exposes old wedding inputs. `frontend/src/App.tsx` also creates a demo wedding automatically on first launch by posting `/api/plan/baseline`, so a new visitor does not land on event selection.
- `frontend/src/tabs.config.ts` has no Events or Vendors tab. There is no shared event-editing flow.
- `frontend/src/api/types.ts` imports the old generated OpenAPI shapes and will need the new event/catalog and vendor contracts.
- The existing shell already supplies lazy tab loading, client-side local storage, keyboard-capable tab primitives, glass styles, and reduced-motion handling; these can be extended rather than replaced.

### Vendors and quota

- `backend/app/routers/vendor_router.py` handles quote comparison and upload only. No provider interface or Places search/detail endpoint exists.
- `backend/app/services/quota_guard.py` has an in-process Gemini RPM/daily counter, but it is named and described only for Gemini and has no provider fallback/cache behavior for vendor searches.
- `backend/app/config.py` has no Google server key, and `.env.example` has no Maps key documentation.
- `frontend/src/views/QuotesTab.tsx` and `VendorQuoteModal.tsx` support quote comparison. There is no vendor search list/map, branch-specific vendor assignment, shortlist model, or Maps JS loading.
- There is no verified Google Places persistence/display policy decision in the project docs. The Places terms and current field-mask/SKU rules must be checked before implementing caching, map display, and saved vendor fields.

### Per-event views, fixtures, and traceability

- `frontend/src/views/OverviewTab.tsx`, `BudgetTab.tsx`, and `TimelineTab.tsx` currently consume the plan-wide wedding fields and task list.
- `backend/app/fixtures/chaos_fixtures.py` contains fixed wedding scenarios, including a Haldi-specific relocation; fixtures are not regenerated against the active plan.
- The existing root `REQUIREMENTS.md` maps the old wedding brief to files/tests and refers to stale paths/components. The requested Appendix A is not present in the repository.
- Current backend tests cover the existing DAG, budget, and cascade behavior, but not event catalog completeness, event-relative lead times, cross-day cascades, event-specific guest counts, custom events, Places field masks, quotas, cache behavior, validation, or provider degradation.

## Implementation constraints

- Keep `backend/app/engine/` deterministic and free of I/O, network, and framework imports; load catalog data in an API/service boundary and pass it into pure builder functions.
- Do not store or display a religion field. Tradition tags may only be internal inference inputs; persisted plan state contains the user's chosen events and explicit needs.
- Do not fabricate market pricing. Per-plate figures must come from the user's input, and all non-user cost ranges must be marked as planning assumptions in one documented configuration.
- Plans stay client-side; vendor persistence is limited to a selected `place_id` and user-authored notes/quote/capacity.
- The app must continue to work without Gemini or Google Maps keys, with visible map-link/manual-entry fallback.

## Assumptions to verify in the Phase 2 report

- Since Appendix A is absent from this checkout, the starter catalog will contain only the sample events explicitly named in the request: Mehendi, Sangeet, Pheras, Nikah, Walima, Church ceremony, Reception, and Pooja. Each catalog entry will be marked as a draft for review by people from its community.
- If Google's Places policy disallows caching any returned display fields, the in-memory cache will retain only `place_id` references; display fields will be re-fetched for a user-visible search. The report will state the resulting cost and cache trade-off.

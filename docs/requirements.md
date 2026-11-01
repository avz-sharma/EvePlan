# Supported workflows

| Workflow | Implementation | Verification |
| --- | --- | --- |
| Google sign-in and isolated account storage | `backend/app/routers/auth_router.py`, `frontend/src/components/AuthGate.tsx` | `backend/tests/test_auth.py`, `frontend/src/__tests__/authGate.test.tsx` |
| Choose days, events and host-entered budgets | `backend/app/engine/plan_builder.py`, `frontend/src/components/OnboardingWizard.tsx` | `backend/tests/test_onboarding_api.py`, Playwright onboarding journey |
| Dependencies and deterministic replanning | `backend/app/engine/dependency_scheduler.py`, `backend/app/engine/cascade_replanner.py` | DAG, cascade, immutable-input and saved-fixture backend tests |
| Budget trade-offs and conflict reporting | `backend/app/engine/budget_tradeoffs.py`, `backend/app/engine/conflict_rules.py` | `backend/tests/test_budget_tradeoffs.py` |
| Manual vendor quotes and branch comparison | `frontend/src/components/SavedQuotes.tsx`, pure quote operations | `backend/tests/test_saved_quotes.py`, frontend store and quote tests |
| Optional Groq interpretation and quote analysis | `backend/app/services/groq_extractor.py`, `backend/app/services/quote_analysis.py` | mocked provider and quota tests |
| Keyless vendor discovery | `frontend/src/lib/googleMapsUrl.ts` | URL unit tests; vendor browser workflow |

The engine computes from event choices and host-entered numbers. No religion profile, vendor price feed or database is required. Upload extraction is unavailable; valid legacy uploads return HTTP 501.

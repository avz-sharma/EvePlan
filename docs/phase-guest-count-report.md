# Guest-count change and budget report

Exact attendance requests now have an optional `guest_count_override` in the extraction schema. Both the provider prompt and deterministic fallback can express “only 50 guests” without treating it as an addition. An exact total resets attendance across all events; relative additions continue to preserve custom event attendance. Guest reductions are also recognized. Existing clients and saved fixtures remain compatible, and OpenAPI and frontend declarations are synchronized.

The streaming API emits readable error events for unrecognized changes and validation failures. The client routes these to the existing error banner and retains the submitted prompt for retry. Failed validations do not update the stored plan. The budget tab now explains the maximum-cost calculation, budget ceiling, and missing costs for unquoted categories.

The reported calculation was correct under the existing assumptions: 70 × 8 × ₹2,500 = ₹14 lakh, plus ₹1.4 lakh reserve, divided by ₹20 lakh = 77%. Setting all eight events to 50 yields ₹10 lakh plus ₹1 lakh reserve = 55%. The lower catering estimate is 70 × 8 × ₹400 = ₹2.24 lakh before contingency. These are provisions, not actual spending or a complete vendor cost forecast.

Validation: all 119 backend tests and 48 frontend tests passed. Backend Ruff and strict mypy passed; frontend lint/type checks and production build passed. Regression tests cover the 3/2/3 event budget, exact count with no provider or provider failure, custom event attendance reset, input immutability, unknown requests, and explicit special-diet validation errors. Backend tests required execution outside the Windows sandbox because asyncio's local socket pair hung inside it. Existing Starlette and frontend test-environment warnings remain.

Assumptions and limits: an unqualified absolute guest count applies to all events; no new prices or automatic budget-spending targets were introduced. Without the original request response or saved plan, the exact cause of the reported generic error cannot be established. Changes are local and have not been deployed. Existing unrelated working-tree changes were preserved.

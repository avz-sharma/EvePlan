# Guest-count change and budget audit

- The reported budget is reproducible: 70 guests × 8 events × ₹2,500 = ₹14,00,000; 10% reserve adds ₹1,40,000; ₹15,40,000 / ₹20,00,000 = 77%. The ₹400 minimum produces ₹2,24,000 before reserve. The budget maximum is the ceiling; unquoted non-catering categories have no estimated cost.
- The fallback parser recognizes guest additions but no absolute guest totals or reductions. The extraction schema has no absolute count, so the LLM cannot express “only 50 guests” without calculating a delta; it also receives no current headcount.
- Unrecognized prompts currently rebuild the plan with a zero delta. Engine validation exceptions after streaming starts terminate the response without an actionable error event, and the UI discards error details.
- The precise original failure cannot be identified without its response or saved plan. Regression coverage should exercise exact counts with provider fallback, the eight-event budget, and validation errors without mutating the original plan.

Assumption: an unqualified exact guest count applies to the plan and all events; relative additions preserve event-specific attendance as before. New schema fields are optional for existing clients and fixtures. No new dependencies are needed.

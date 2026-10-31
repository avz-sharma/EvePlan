"""Documented product planning heuristics; none of these are vendor market rates."""

# Every fixed planning percentage used by budgets, scenarios, and trade-off
# suggestions lives here so the UI can describe them as optional heuristics.
CONTINGENCY_RATE = 0.10
GUEST_SURGE_SCENARIO_SHARE = 0.10
GUEST_REDUCTION_MAX_SHARE = 1 / 3
LARGE_BUCKET_FLAG_SHARE = 0.25
DECOR_FALLBACK_DEFICIT_SHARE = 0.60
DECOR_DEFICIT_SHARE = 0.80
DECOR_MAX_BUDGET_SHARE = 0.35
DECOR_MIN_SAVINGS_SHARE = 0.85
CONTINGENCY_REDUCTION_SHARE = 0.50
CATERING_TIER_DEFICIT_SHARE = 0.40
TRADEOFF_MIN_SAVINGS_SHARE = 0.80

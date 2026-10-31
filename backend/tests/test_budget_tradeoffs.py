from app.engine.budget_tradeoffs import compute_contingency_buffer, evaluate_budget_tradeoffs
from app.schemas.plan_state import BudgetBucket


def test_contingency_buffer_exact_ten_percent() -> None:
    buffer = compute_contingency_buffer(100_000.0, 0.10)
    assert buffer == 10_000.0


def test_budget_within_cap_no_tradeoffs_generated() -> None:
    buckets = [
        BudgetBucket(
            category="Venue",
            allocated_min_inr=300000.0,
            allocated_max_inr=400000.0,
            contingency_inr=40000.0,
            assumptions=["Includes banquet hall & lawn"],
        ),
        BudgetBucket(
            category="Catering",
            allocated_min_inr=400000.0,
            allocated_max_inr=500000.0,
            contingency_inr=50000.0,
            assumptions=["4 meals across 2 days"],
        ),
    ]
    # Total max = (400k + 40k) + (500k + 50k) = 990,000
    updated_buckets, options, is_violated = evaluate_budget_tradeoffs(
        buckets=buckets,
        total_budget_cap_inr=1_200_000.0,
        guest_count=150,
        per_plate_min_inr=1500.0,
        per_plate_max_inr=2200.0,
    )

    assert not is_violated
    assert len(options) == 0
    assert len(updated_buckets) == 2


def test_budget_exceeded_generates_three_deterministic_options() -> None:
    buckets = [
        BudgetBucket(
            category="Venue",
            allocated_min_inr=600000.0,
            allocated_max_inr=800000.0,
            contingency_inr=80000.0,
            assumptions=["Main palace lawn"],
        ),
        BudgetBucket(
            category="Catering",
            allocated_min_inr=800000.0,
            allocated_max_inr=1000000.0,
            contingency_inr=100000.0,
            assumptions=["Buffet + Live counters"],
        ),
        BudgetBucket(
            category="Decor & Floral",
            allocated_min_inr=400000.0,
            allocated_max_inr=600000.0,
            contingency_inr=60000.0,
            assumptions=["Imported florals"],
        ),
    ]
    # Total max with 10% contingency = 880k + 1.1M + 660k = 2,640,000
    # Hard cap = 2,000,000 -> Deficit = 640,000
    updated_buckets, options, is_violated = evaluate_budget_tradeoffs(
        buckets=buckets,
        total_budget_cap_inr=2_000_000.0,
        guest_count=200,
        per_plate_min_inr=1800.0,
        per_plate_max_inr=2500.0,
    )

    assert is_violated
    assert len(options) == 3

    # Option 1: Headcount trim
    opt1 = options[0]
    assert opt1.id == "opt_headcount_trim"
    assert opt1.guest_count_adjustment < 0
    assert "Catering" in opt1.bucket_adjustments
    assert opt1.savings_max_inr > 0

    # Option 2: Decor downgrade
    opt2 = options[1]
    assert opt2.id == "opt_decor_downgrade"
    assert "Decor & Floral" in opt2.bucket_adjustments
    assert opt2.savings_max_inr > 0

    # Option 3: Catering tier & buffer shift
    opt3 = options[2]
    assert opt3.id == "opt_tier_and_buffer_shift"
    assert "Catering" in opt3.bucket_adjustments
    assert "Venue" in opt3.bucket_adjustments
    assert opt3.savings_max_inr > 0


"""Deterministic budget adjustments based on entered amounts and planning heuristics."""

import math
from typing import Sequence

from ..schemas.intent_delta import TradeOffOption
from ..schemas.plan_state import BudgetBucket
from .planning_heuristics import (
    CATERING_TIER_DEFICIT_SHARE,
    CONTINGENCY_RATE,
    CONTINGENCY_REDUCTION_SHARE,
    DECOR_DEFICIT_SHARE,
    DECOR_FALLBACK_DEFICIT_SHARE,
    DECOR_MAX_BUDGET_SHARE,
    DECOR_MIN_SAVINGS_SHARE,
    GUEST_REDUCTION_MAX_SHARE,
    LARGE_BUCKET_FLAG_SHARE,
    TRADEOFF_MIN_SAVINGS_SHARE,
)


def compute_contingency_buffer(
    allocated_max_inr: float, buffer_percentage: float = CONTINGENCY_RATE
) -> float:
    """Computes the configured pure deterministic contingency reserve."""
    return round(allocated_max_inr * buffer_percentage, 2)


def evaluate_budget_tradeoffs(
    buckets: Sequence[BudgetBucket],
    total_budget_cap_inr: float,
    guest_count: int,
    per_plate_min_inr: float,
    per_plate_max_inr: float,
    buffer_percentage: float = CONTINGENCY_RATE,
) -> tuple[list[BudgetBucket], list[TradeOffOption], bool]:
    """Recomputes the configured reserve and offers heuristic recovery options when over cap.

    Zero LLM imports - pure deterministic arithmetic complying with LAW-01 and LAW-03.
    """
    updated_buckets: list[BudgetBucket] = []
    total_projected_max = 0.0

    for bucket in buckets:
        # Recompute the configured reserve deterministically.
        contingency = compute_contingency_buffer(bucket.allocated_max_inr, buffer_percentage)
        bucket_total = bucket.allocated_max_inr + contingency
        total_projected_max += bucket_total

        is_violated = (
            bucket.category_budget_cap_inr is not None
            and bucket.allocated_max_inr > bucket.category_budget_cap_inr
        )
        updated_buckets.append(
            bucket.model_copy(
                update={
                    "contingency_inr": contingency,
                    "is_violated": is_violated,
                }
            )
        )

    is_overall_violated = total_projected_max > total_budget_cap_inr
    deficit_inr = max(0.0, total_projected_max - total_budget_cap_inr)

    # Flag largest buckets if total is violated
    if is_overall_violated:
        for b in updated_buckets:
            if b.allocated_max_inr > (total_budget_cap_inr * LARGE_BUCKET_FLAG_SHARE):
                b.is_violated = True

    tradeoff_options: list[TradeOffOption] = []

    if is_overall_violated and deficit_inr > 0:
        # Option 1: Headcount Trim (Trim guest list to heal deficit)
        avg_cost_per_guest = total_projected_max / guest_count
        guests_to_trim = math.ceil(deficit_inr / avg_cost_per_guest)
        guests_to_trim = min(
            guests_to_trim, max(1, math.floor(guest_count * GUEST_REDUCTION_MAX_SHARE))
        )
        catering_savings = round(guests_to_trim * per_plate_max_inr * (1 + buffer_percentage), 2)

        tradeoff_options.append(
            TradeOffOption(
                id="opt_headcount_trim",
                title=f"Trim Guest List by {guests_to_trim} Guests",
                description=(
                    f"Scale down attendance for selected events by {guests_to_trim} attendees "
                    "to reduce catering and seating costs."
                ),
                savings_min_inr=round(guests_to_trim * per_plate_min_inr, 2),
                savings_max_inr=catering_savings,
                bucket_adjustments={"Catering": -catering_savings},
                guest_count_adjustment=-guests_to_trim,
                impact_level="MEDIUM",
                tradeoff_rationale=(
                    f"Reduces catering volume by {guests_to_trim} plates at ₹{per_plate_max_inr:.0f}/head "
                    f"+ {buffer_percentage:.0%} reserve, reducing the projected amount by ₹{catering_savings:,.0f}."
                ),
            )
        )

        # Option 2: Decor Tier Downgrade & Floral Rationalization
        decor_bucket = next((b for b in updated_buckets if "Decor" in b.category), None)
        decor_max = (
            decor_bucket.allocated_max_inr
            if decor_bucket
            else deficit_inr * DECOR_FALLBACK_DEFICIT_SHARE
        )
        decor_cut = round(
            min(deficit_inr * DECOR_DEFICIT_SHARE, decor_max * DECOR_MAX_BUDGET_SHARE), 2
        )

        tradeoff_options.append(
            TradeOffOption(
                id="opt_decor_downgrade",
                title="Review decor scope for selected events",
                description=(
                    "Review decor scope, materials, and reuse options for selected events."
                ),
                savings_min_inr=round(decor_cut * DECOR_MIN_SAVINGS_SHARE, 2),
                savings_max_inr=decor_cut,
                bucket_adjustments={decor_bucket.category if decor_bucket else "Decor": -decor_cut},
                guest_count_adjustment=0,
                impact_level="LOW",
                tradeoff_rationale=(
                    f"This configured planning heuristic proposes a ₹{decor_cut:,.0f} decor reduction "
                    "for the host to review."
                ),
            )
        )

        # Option 3: review catering scope and reduce the configured reserve.
        buffer_savings = 0.0
        budget_adjustments = {}
        for b in updated_buckets:
            amount = round(b.contingency_inr * CONTINGENCY_REDUCTION_SHARE, 2)
            buffer_savings += amount
            budget_adjustments[b.category] = -amount

        catering_cut = round(deficit_inr * CATERING_TIER_DEFICIT_SHARE, 2)
        total_opt3_max = round(buffer_savings + catering_cut, 2)

        tradeoff_options.append(
            TradeOffOption(
                id="opt_tier_and_buffer_shift",
                title=f"Review catering scope and contingency reserve ({buffer_percentage * (1 - CONTINGENCY_REDUCTION_SHARE):.0%} remaining)",
                description=(
                    "Review catering scope and reduce the contingency allowance only after "
                    "vendor terms and remaining risks are confirmed."
                ),
                savings_min_inr=round(total_opt3_max * TRADEOFF_MIN_SAVINGS_SHARE, 2),
                savings_max_inr=total_opt3_max,
                bucket_adjustments={
                    **budget_adjustments,
                    "Catering": budget_adjustments.get("Catering", 0.0) - catering_cut,
                },
                guest_count_adjustment=0,
                impact_level="HIGH",
                tradeoff_rationale=(
                    "This configured planning heuristic combines a proposed catering reduction with "
                    f"₹{buffer_savings:,.0f} from reserve adjustments for the host to review."
                ),
            )
        )

    return updated_buckets, tradeoff_options, is_overall_violated

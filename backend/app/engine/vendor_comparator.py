from ..schemas.vendor_quote import HiddenCostFlag, NormalizedQuote, QuoteComparison


def compare_vendor_quote(
    quote: NormalizedQuote,
    allocated_budget_max_inr: float,
    guest_count: int,
) -> QuoteComparison:
    """Compare host-entered quote amounts without inventing fees or market rates."""
    flags: list[HiddenCostFlag] = []
    confirmation_fields = [
        ("Applicable taxes", quote.includes_gst),
        ("Power backup", quote.includes_generator_backup),
        ("Separate Jain meal preparation", quote.includes_jain_counter),
        ("Corkage or glassware", quote.includes_corkage),
    ]
    for label, included in confirmation_fields:
        if included is False:
            flags.append(HiddenCostFlag(
                name=f"{label} marked as excluded",
                estimated_impact_inr=None,
                description=(
                    "The host marked this as excluded. Confirm whether it applies to this event "
                    "and ask the vendor for any amount; EvePlan does not estimate it."
                ),
                severity="MEDIUM",
            ))

    variance = round(quote.raw_total_inr - allocated_budget_max_inr, 2)
    is_within_budget = variance <= 0
    target = round(quote.raw_total_inr if is_within_budget else allocated_budget_max_inr, 2)
    if is_within_budget:
        negotiation_script = (
            f"Hello {quote.vendor_name}, thanks for the quote for {quote.category}. "
            f"The host-entered amount is ₹{quote.raw_total_inr:,.0f}. Please confirm the "
            "written scope, inclusions, applicable taxes, and payment/cancellation terms."
        )
    else:
        negotiation_script = (
            f"Hello {quote.vendor_name}, thanks for the quote for {quote.category}. "
            f"The host-entered budget cap is ₹{allocated_budget_max_inr:,.0f}, and the quote is "
            f"₹{quote.raw_total_inr:,.0f}. Could you offer a revised scope or quote within the "
            "host's cap? Please provide any revised amount in writing."
        )

    questions = [
        f"Can you confirm capacity and staffing for {guest_count} attendees?",
        "Which services, setup, and breakdown are included in the written total?",
        "Which taxes, venue fees, or optional charges apply, and what are their amounts?",
        "What are the payment schedule, cancellation, and rescheduling terms?",
        "How will final attendance or scope changes affect the written quote?",
    ]
    return QuoteComparison(
        normalized_quote=quote,
        budget_allocated_max_inr=allocated_budget_max_inr,
        variance_inr=variance,
        is_within_budget=is_within_budget,
        hidden_cost_flags=flags,
        target_counter_offer_inr=target,
        negotiation_script=negotiation_script,
        vendor_interview_questions=questions,
    )

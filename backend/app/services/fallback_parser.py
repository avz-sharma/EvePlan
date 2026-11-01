"""Deterministic regex/keyword fallback parser for when Groq API is unavailable.

Extracts guest count changes, date shifts, per-plate rate hikes, and venue
relocations from plain English using regex patterns. Sets degraded_mode = True
in response metadata so the UI shows a transparent status badge.
"""

import re

from ..schemas.intent_delta import PlanDelta

# Patterns accept both "40 extra guests" and "extra 40 guests" forms
_GUEST_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"(\+|add(?:ing)?|extra|more|additional|bring(?:ing)?)\s*(\d+)\s*"
        r"(?:extra\s+)?(?:guests?|people|attendees?|cousins?|relatives?|members?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(\d+)\s+(?:extra|more|additional)\s*"
        r"(?:guests?|people|attendees?|cousins?|relatives?|members?)",
        re.IGNORECASE,
    ),
]

_GUEST_REDUCTION_PATTERN = re.compile(
    r"(?:-|remove|reduce\s+by|subtract)\s*(\d+)\s*(?:guests?|people|attendees?)|"
    r"(\d+)\s+(?:fewer|less)\s+(?:guests?|people|attendees?)",
    re.IGNORECASE,
)
_GUEST_TOTAL_PATTERN = re.compile(
    r"(?:only|inly|exactly|just|total(?:\s+of)?|set(?:\s+it)?\s+to)\s+(\d+)\s*(?:guests?|people|attendees?)|"
    r"(?:guests?|headcount|guest\s+count)\s*(?:should\s+be|to|is|=|:)\s*(\d+)|"
    r"(?:reduce|change|set|limit|update)\s+(?:(?:the|total|number\s+of)\s+)*(?:guests?|headcount|guest\s+count)\s+to\s+(\d+)",
    re.IGNORECASE,
)
_BARE_GUEST_TOTAL_PATTERN = re.compile(
    r"\s*(\d+)\s+guests?(?:\s+(?:only|total))?(?:\s+(?:to|for|at|in)\s+(?:all\s+|the\s+)?events?)?[.!]?\s*",
    re.IGNORECASE,
)

_DATE_EARLIER_PATTERN = re.compile(
    r"(\d+)\s*(?:weeks?|wks?)\s*(?:earlier|sooner|before|forward)",
    re.IGNORECASE,
)

_DATE_LATER_PATTERN = re.compile(
    r"(\d+)\s*(?:weeks?|wks?)\s*(?:later|postponed?|delayed?|pushed?\s*back)",
    re.IGNORECASE,
)

_DATE_DAYS_EARLIER = re.compile(
    r"(\d+)\s*(?:days?)\s*(?:earlier|sooner|before|forward)",
    re.IGNORECASE,
)

_DATE_DAYS_LATER = re.compile(
    r"(\d+)\s*(?:days?)\s*(?:later|postponed?|delayed?|pushed?\s*back)",
    re.IGNORECASE,
)

_MONEY_AMOUNT = r"(?P<amount>\d[\d,]*(?:\.\d+)?)\s*(?P<scale>lakhs?|lacs?|l|k)?"

_PLATE_RATE_PATTERN = re.compile(
    r"(?:per[- ]?plate|per[- ]?head|rate)\s*(?:by|increase[ds]?|hike[ds]?|raise[ds]?|up)?\s*"
    rf"(?:by\s+)?(?:₹|rs\.?|inr)?\s*{_MONEY_AMOUNT}",
    re.IGNORECASE,
)

_PLATE_RATE_PATTERN_2 = re.compile(
    r"(?:increase[ds]?|hike[ds]?|raise[ds]?)\s+(?:per[- ]?plate|per[- ]?head|rate)\s+"
    rf"(?:by\s+)?(?:₹|rs\.?|inr)?\s*{_MONEY_AMOUNT}",
    re.IGNORECASE,
)

_INDOOR_PATTERNS = re.compile(
    r"(?:rain|storm|thunder|(?:bad|severe|heavy|wet|rainy)\s+weather|weather\s+(?:warning|alert|forecast|issue)|"
    r"indoors?|move\s*(?:haldi|sangeet|mehendi)?.*indoors?|"
    r"garden\s*lost|outdoor.*cancelled|venue.*lost)",
    re.IGNORECASE,
)

_JAIN_PATTERN = re.compile(
    r"(\d+)\s*(?:jain|strict\s*veg)",
    re.IGNORECASE,
)

_VENUE_CAPACITY_PATTERN = re.compile(
    r"venue\s*(?:capacity|limit|max)\s*(?:is|to|=|:)?\s*(\d+)",
    re.IGNORECASE,
)

_BUDGET_PATTERN = re.compile(
    rf"budget\s*(?:cut|reduce[ds]?|decrease[ds]?|lower(?:ed)?)\s*(?:by\s+)?(?:₹|rs\.?|inr)?\s*{_MONEY_AMOUNT}",
    re.IGNORECASE,
)


def _parse_indian_amount(match: re.Match[str]) -> float:
    amount = float(match.group("amount").replace(",", ""))
    scale = (match.group("scale") or "").casefold()
    if scale in {"l", "lac", "lacs", "lakh", "lakhs"}:
        amount *= 100_000
    elif scale == "k":
        amount *= 1_000
    return amount


def parse_user_intent(user_text: str) -> tuple[PlanDelta, bool]:
    """Parse natural language into a PlanDelta using deterministic regex rules.

    Returns:
        tuple[PlanDelta, bool]: (delta, was_any_field_extracted)
    """
    guest_delta = 0
    guest_total: int | None = None
    days_delta = 0
    plate_delta = 0.0
    indoor = False
    jain_delta = 0
    venue_override: int | None = None
    budget_delta = 0.0
    constraints: list[str] = []
    extracted = False

    # --- Guest count ---
    for pattern in _GUEST_PATTERNS:
        match = pattern.search(user_text)
        if match:
            groups = match.groups()
            # Find the numeric group
            for g in groups:
                if g and g.isdigit():
                    guest_delta = int(g)
                    extracted = True
                    break
            if guest_delta > 0:
                break

    reduction = _GUEST_REDUCTION_PATTERN.search(user_text)
    if reduction:
        guest_delta = -int(next(group for group in reduction.groups() if group))
        extracted = True
    if not guest_delta:
        total = _GUEST_TOTAL_PATTERN.search(user_text) or _BARE_GUEST_TOTAL_PATTERN.fullmatch(user_text)
        if total:
            guest_total = int(next(group for group in total.groups() if group))
            if not 1 <= guest_total <= 100_000:
                raise ValueError("Guest count must be between 1 and 100,000.")
            extracted = True

    # --- Date shifts (weeks) ---
    m = _DATE_EARLIER_PATTERN.search(user_text)
    if m:
        days_delta = -int(m.group(1)) * 7
        extracted = True
    else:
        m = _DATE_LATER_PATTERN.search(user_text)
        if m:
            days_delta = int(m.group(1)) * 7
            extracted = True

    # --- Date shifts (days) ---
    if days_delta == 0:
        m = _DATE_DAYS_EARLIER.search(user_text)
        if m:
            days_delta = -int(m.group(1))
            extracted = True
        else:
            m = _DATE_DAYS_LATER.search(user_text)
            if m:
                days_delta = int(m.group(1))
                extracted = True

    # --- Per-plate rate hike ---
    m = _PLATE_RATE_PATTERN.search(user_text) or _PLATE_RATE_PATTERN_2.search(user_text)
    if m:
        plate_delta = _parse_indian_amount(m)
        extracted = True

    # --- Indoor relocation ---
    if _INDOOR_PATTERNS.search(user_text):
        indoor = True
        extracted = True
        constraints.append("Weather-related indoor relocation flagged via fallback parser.")

    # --- Jain dietary ---
    m = _JAIN_PATTERN.search(user_text)
    if m:
        jain_delta = int(m.group(1))
        extracted = True

    # --- Venue capacity ---
    m = _VENUE_CAPACITY_PATTERN.search(user_text)
    if m:
        venue_override = int(m.group(1))
        extracted = True

    # --- Budget reduction ---
    m = _BUDGET_PATTERN.search(user_text)
    if m:
        budget_delta = -_parse_indian_amount(m)
        extracted = True

    delta = PlanDelta(
        guest_count_delta=guest_delta,
        guest_count_override=guest_total,
        days_until_event_delta=days_delta,
        per_plate_delta_inr=plate_delta,
        indoor_relocation=indoor,
        dietary_jain_delta=jain_delta,
        venue_capacity_override=venue_override,
        budget_cap_inr_delta=budget_delta,
        new_constraints=constraints,
    )

    return delta, extracted


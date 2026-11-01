"""Budgets derived only from host-entered ranges and quotations."""

from __future__ import annotations

from collections import defaultdict
from typing import Mapping

from ..schemas.catalog import EventCatalog, EventCatalogEntry
from ..schemas.plan_state import (
    BudgetBucket,
    EventPlan,
)
from .event_metadata import (
    VENDOR_CATEGORY_LABELS,
    event_metadata,
)
from .quote_selection import effective_assignments


def build_budgets(
    plan: EventPlan, catalog: EventCatalog, index: Mapping[str, EventCatalogEntry]
) -> list[BudgetBucket]:
    plan = plan.model_copy(update={"vendor_assignments": effective_assignments(plan)})
    guest_counts: dict[str, int] = defaultdict(int)
    categories: set[str] = set()
    for day in plan.days:
        for event in day.events:
            metadata = event_metadata(event, catalog, index)
            categories.update(metadata.get("vendor_categories_needed", []))
            categories.update(category.value for category in event.vendor_categories)
            guest_counts[event.id] = event.guest_count or plan.guest_count
    categories.update(assignment.category.value for assignment in plan.vendor_assignments)

    quotes: dict[str, float] = defaultdict(float)
    quoted_events: dict[str, set[str]] = defaultdict(set)
    category_caps: dict[str, float] = defaultdict(float)
    categories_with_caps: set[str] = set()
    for assignment in plan.vendor_assignments:
        if assignment.quoted_total_inr is not None:
            quotes[assignment.category.value] += assignment.quoted_total_inr
            quoted_events[assignment.category.value].add(assignment.event_id)
        if assignment.category_budget_cap_inr is not None:
            category_caps[assignment.category.value] += assignment.category_budget_cap_inr
            categories_with_caps.add(assignment.category.value)

    if "caterer" in categories:
        unquoted_guest_total = sum(
            count
            for event_id, count in guest_counts.items()
            if event_id not in quoted_events.get("caterer", set())
        )
        catering_min = quotes.get("caterer", 0.0) + unquoted_guest_total * plan.per_plate_min_inr
        catering_max = quotes.get("caterer", 0.0) + unquoted_guest_total * plan.per_plate_max_inr
        category_values = {"caterer": (catering_min, catering_max)}
    else:
        category_values = {}

    for category, quote in quotes.items():
        if category != "caterer":
            category_values[category] = (quote, quote)

    result: list[BudgetBucket] = []
    for category in sorted(categories):
        label = VENDOR_CATEGORY_LABELS.get(category, category.title())
        minimum, maximum = category_values.get(category, (0.0, 0.0))
        assumptions = (
            ["Based on user-entered per-plate range and event guest counts."]
            if category == "caterer"
            else []
        )
        if category in quotes and category != "caterer":
            assumptions = ["Based on the user's entered vendor quote."]
        elif category != "caterer":
            assumptions = ["No user-entered quote; amount is not estimated."]
        if category == "caterer" and plan.per_plate_max_inr <= 0 and not quotes.get(category):
            assumptions = ["No per-plate budget or quote entered; amount is not estimated."]
        contingency = round(maximum * plan.contingency_percent / 100, 2)
        category_cap = category_caps[category] if category in categories_with_caps else None
        result.append(
            BudgetBucket(
                category=label,
                allocated_min_inr=round(minimum, 2),
                allocated_max_inr=round(maximum, 2),
                contingency_inr=contingency,
                assumptions=assumptions,
                category_budget_cap_inr=category_cap,
                is_violated=category_cap is not None and maximum > category_cap,
            )
        )
    projected = sum(item.allocated_max_inr + item.contingency_inr for item in result)
    if plan.total_budget_cap_inr > 0 and projected > plan.total_budget_cap_inr:
        for bucket in result:
            if bucket.allocated_max_inr > 0:
                bucket.is_violated = True
    return result

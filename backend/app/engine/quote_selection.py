"""Quotation validation and the effective selected vendor view."""

from __future__ import annotations

from ..schemas.plan_state import (
    EventPlan,
    VendorAssignment,
)


def validate_quotes(plan: EventPlan) -> None:
    """Reject orphaned, duplicate or conflicting selected quote records."""
    events = {event.id for day in plan.days for event in day.events}
    ids: set[str] = set()
    groups: set[tuple[str, str]] = set()
    for quote in plan.saved_quotes:
        if quote.event_id not in events or quote.id in ids:
            raise ValueError("Quotation references an unknown event or duplicate quotation ID")
        ids.add(quote.id)
        if quote.selected:
            group = (quote.event_id, quote.category.value)
            if quote.finalized_inr is None or group in groups:
                raise ValueError("Select one quotation per event/category with a finalized amount")
            groups.add(group)


def effective_assignments(plan: EventPlan) -> list[VendorAssignment]:
    """Overlay selected written quotes on manual assignments without double counting."""
    selected = [q for q in plan.saved_quotes if q.selected]
    groups = {(q.event_id, q.category) for q in selected}
    return [a for a in plan.vendor_assignments if (a.event_id, a.category) not in groups] + [
        VendorAssignment(
            event_id=q.event_id,
            category=q.category,
            place_id=f"quote:{q.id}",
            notes=q.vendor_name,
            quoted_total_inr=q.finalized_inr,
            category_budget_cap_inr=q.budget_cap_inr,
        )
        for q in selected
    ]

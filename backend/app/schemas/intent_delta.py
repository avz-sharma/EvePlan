from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .plan_state import SubEventType


class PlanDelta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    guest_count_delta: int = Field(default=0, description="Change in total guest headcount")
    sub_event_filter: list[SubEventType] | None = Field(default=None, max_length=4, description="Subset of active sub-events")
    budget_cap_inr_delta: float = Field(default=0.0, description="Shift in overall budget limit in INR")
    per_plate_delta_inr: float = Field(default=0.0, description="Shift in catering per-plate rate in INR")
    days_until_event_delta: int = Field(default=0, description="Shift in timeline days (negative = sooner)")
    venue_capacity_override: int | None = Field(default=None, description="New venue capacity limit")
    indoor_relocation: bool = Field(default=False, description="True if weather forces outdoor events indoors")
    dietary_jain_delta: int = Field(default=0, description="Change in Jain dietary headcount")
    new_constraints: list[Annotated[str, StringConstraints(max_length=500)]] = Field(default_factory=list, max_length=40, description="Ad-hoc constraints extracted or passed")


class CascadeDiff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mutated_attribute: str = Field(description="Primary field changed, e.g., guest_count, date, per_plate")
    affected_task_ids: list[str] = Field(description="Tasks whose dates, status, or scope were touched")
    affected_budget_categories: list[str] = Field(description="Budget buckets whose costs were altered")
    node_hops: dict[str, int] = Field(description="Map from task_id to its hop distance from the mutation root")
    violations: list[str] = Field(default_factory=list, description="Any hard constraint or budget breaches")
    summary: str = Field(description="Deterministic human-readable explanation of cascade impact")


class TradeOffOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="Identifier for trade-off option, e.g. opt_trim_reception")
    title: str = Field(description="Brief title of the trade-off")
    description: str = Field(description="Actionable description of the adjustment")
    savings_min_inr: float = Field(ge=0.0, description="Lower bound estimated recovery in INR")
    savings_max_inr: float = Field(ge=0.0, description="Upper bound estimated recovery in INR")
    bucket_adjustments: dict[str, float] = Field(
        description="Keyed by category with delta in INR (e.g., {'Decor & Floral': -150000.0})"
    )
    guest_count_adjustment: int = Field(default=0, description="Reduction in guest count if applicable")
    impact_level: str = Field(description="Severity impact: LOW, MEDIUM, or HIGH")
    tradeoff_rationale: str = Field(description="Deterministic explanation of why this trade-off heals the plan")

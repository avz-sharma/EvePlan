"""Bounded plan inputs and backward-compatible derived state models."""

from datetime import date as CalendarDate
from enum import Enum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

HintKey = Annotated[str, StringConstraints(max_length=80)]
HintText = Annotated[str, StringConstraints(max_length=500)]
HintList = Annotated[list[HintText], Field(max_length=40)]
PlanNote = Annotated[str, StringConstraints(max_length=500)]
AccessibilityNeed = Annotated[str, StringConstraints(max_length=120)]


class SubEventType(str, Enum):
    """Deprecated compatibility enum for Phase 1 saved plans."""

    HALDI = "HALDI"
    SANGEET = "SANGEET"
    WEDDING = "WEDDING"
    RECEPTION = "RECEPTION"


class TimeSlot(str, Enum):
    """Host-selectable time-of-day slots for an event."""

    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    NIGHT = "night"


class VendorCategory(str, Enum):
    """Supported services used to group vendor assignments and quotations."""

    VENUE = "venue"
    CATERER = "caterer"
    DECORATOR = "decorator"
    PHOTOGRAPHER = "photographer"
    MAKEUP = "makeup"
    MUSIC = "music"
    TRANSPORT = "transport"


class PlanEvent(BaseModel):
    """An immutable event instance identified by a catalog choice or custom name."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=80)
    catalog_id: str | None = Field(default=None, min_length=1, max_length=80)
    custom_name: str | None = Field(default=None, min_length=1, max_length=120)
    time_slot: TimeSlot = TimeSlot.EVENING
    guest_count: int | None = Field(default=None, ge=1, le=100_000)
    venue_type: str | None = Field(default=None, min_length=1, max_length=80)
    vendor_categories: list[VendorCategory] = Field(default_factory=list, max_length=7)

    @model_validator(mode="after")
    def require_catalog_or_custom_event(self) -> Self:
        """Require exactly one event identity source before engine construction."""
        if (self.catalog_id is None) == (self.custom_name is None):
            raise ValueError("Choose one catalog event or enter one custom event name")
        if self.custom_name is not None and self.vendor_categories is None:
            raise ValueError("Custom events require an explicit vendor category list")
        return self


class EventDay(BaseModel):
    """One ordered celebration day and its selected events."""

    model_config = ConfigDict(extra="forbid")

    day_number: int = Field(ge=1, le=5)
    date: CalendarDate | None = None
    events: list[PlanEvent] = Field(default_factory=list, max_length=20)


class DietarySplit(BaseModel):
    """Legacy dietary-count summary retained for saved-plan compatibility."""

    model_config = ConfigDict(extra="forbid")

    regular: int = Field(default=0, ge=0, description="Count of regular dietary guests")
    jain: int = Field(default=0, ge=0, description="Count of strictly Jain vegetarian guests")
    vegan: int = Field(default=0, ge=0, description="Count of vegan guests")
    kids: int = Field(default=0, ge=0, description="Count of children under 10")


class AccessibilityNeeds(BaseModel):
    """Legacy access requirements retained alongside host-entered needs."""

    model_config = ConfigDict(extra="forbid")

    elderly_count: int = Field(
        default=0, ge=0, description="Number of elderly guests requiring assistance"
    )
    wheelchair_access_required: bool = Field(
        default=False, description="Whether venue must be ramp-accessible"
    )
    ground_floor_dining: bool = Field(
        default=False, description="Whether elderly dining must be on ground level"
    )


class BudgetBucket(BaseModel):
    """Host-derived allocation range, reserve and category-cap status."""

    model_config = ConfigDict(extra="forbid")

    category: str = Field(
        min_length=1, max_length=80, description="Budget category, e.g., Catering, Decor, Venue"
    )
    allocated_min_inr: float = Field(ge=0.0, description="Minimum projected cost in INR")
    allocated_max_inr: float = Field(ge=0.0, description="Maximum projected cost in INR")
    contingency_inr: float = Field(ge=0.0, description="Dedicated 10% contingency buffer in INR")
    assumptions: list[PlanNote] = Field(
        default_factory=list, max_length=20, description="Planning heuristic assumptions"
    )
    is_violated: bool = Field(
        default=False, description="True if allocated_max exceeds budget limit"
    )
    category_budget_cap_inr: float | None = Field(default=None, ge=0.0)


class TaskNode(BaseModel):
    """A dependency task with event-relative dates and calculated CPM values."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(
        min_length=1, max_length=120, description="Unique task identifier, e.g., task_venue_booking"
    )
    title: str = Field(min_length=1, max_length=250, description="Human readable task title")
    category: str = Field(
        min_length=1, max_length=80, description="Category corresponding to budget or workflow"
    )
    sub_event: SubEventType | None = Field(default=None, description="Deprecated Phase 1 field")
    event_id: str | None = Field(default=None, description="Event instance that owns this task")
    event_name: str | None = Field(default=None, max_length=120)
    event_date: CalendarDate | None = Field(
        default=None, description="Date of the event this task supports"
    )
    due_date: CalendarDate | None = Field(
        default=None, description="Task date computed from event date and lead time"
    )
    lead_time_days: int | None = Field(
        default=None, ge=0, description="Days before the associated event"
    )
    budget_category: str | None = Field(default=None, max_length=80)
    duration_days: int = Field(ge=0, description="Estimated work duration in days")
    dependencies: list[str] = Field(
        default_factory=list, max_length=200, description="IDs of upstream prerequisite tasks"
    )
    status: str = Field(
        default="PENDING",
        max_length=20,
        description="Task lifecycle status: PENDING, IN_PROGRESS, COMPLETED, BLOCKED",
    )
    earliest_start: int = Field(
        default=0, ge=0, description="CPM earliest start day from project inception"
    )
    latest_start: int = Field(
        default=0, ge=0, description="CPM latest start day without delaying the event date"
    )
    slack_days: int = Field(default=0, ge=0, description="Total float/slack days")
    is_critical: bool = Field(default=False, description="True if slack_days == 0 (Critical Path)")
    hop_level: int = Field(
        default=0, ge=0, description="Dependency hop distance from mutated root node"
    )


class EventPlan(BaseModel):
    """Bounded client-persisted inputs and their deterministic derived plan state."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80, description="Plan unique identifier")
    title: str = Field(min_length=1, max_length=120, description="Event celebration title")
    template: str = Field(
        default="celebration", max_length=80, description="Selected event plan template"
    )
    guest_count: int = Field(
        default=1, gt=0, le=100_000, description="Total guests; each event defaults to this count"
    )
    total_budget_cap_inr: float = Field(
        default=0.0, ge=0.0, description="User-entered total budget ceiling"
    )
    budget_range_min_inr: float = Field(default=0.0, ge=0.0)
    budget_range_max_inr: float = Field(default=0.0, ge=0.0)
    per_plate_min_inr: float = Field(
        default=0.0, ge=0.0, description="User-entered minimum per-plate budget"
    )
    per_plate_max_inr: float = Field(
        default=0.0, ge=0.0, description="User-entered maximum per-plate budget"
    )
    venue_capacity: int | None = Field(
        default=None, gt=0, description="Deprecated plan-wide capacity compatibility field"
    )
    days_until_event: int = Field(
        default=0, ge=0, description="Days to the first event; compatibility summary"
    )
    dietary_split: DietarySplit = Field(
        default_factory=DietarySplit, description="Deprecated dietary compatibility summary"
    )
    accessibility: AccessibilityNeeds = Field(
        default_factory=AccessibilityNeeds, description="Accessibility requirements"
    )
    sub_events: list[SubEventType] = Field(
        default_factory=list, max_length=4, description="Deprecated Phase 1 compatibility field"
    )
    budget_buckets: list[BudgetBucket] = Field(
        default_factory=list, max_length=30, description="Budget amounts from user inputs or quotes"
    )
    tasks: list[TaskNode] = Field(
        default_factory=list,
        max_length=1000,
        description="DAG nodes generated from selected events",
    )
    city: str = Field(default="", max_length=120)
    first_event_date: CalendarDate | None = None
    days: list[EventDay] = Field(default_factory=list, min_length=1, max_length=5)
    special_diets: dict[Annotated[str, StringConstraints(min_length=1, max_length=60)], int] = (
        Field(default_factory=dict, max_length=20, description="User-entered dietary counts")
    )
    accessibility_needs: list[AccessibilityNeed] = Field(
        default_factory=list, max_length=40, description="User-entered accessibility needs"
    )
    elder_members: int = Field(default=0, ge=0, le=100_000)
    vendor_assignments: list["VendorAssignment"] = Field(default_factory=list, max_length=700)
    saved_quotes: list["SavedQuote"] = Field(default_factory=list, max_length=700)
    contingency_percent: float = Field(default=10, ge=0, le=100, allow_inf_nan=False)
    profile_hints: dict[HintKey, HintList] = Field(
        default_factory=dict,
        max_length=10,
        description="Derived from selected events; contains no religion field",
    )
    notes: list[PlanNote] = Field(
        default_factory=list,
        max_length=100,
        description="Event planning notes and constraint warnings",
    )

    @model_validator(mode="after")
    def validate_event_days(self) -> Self:
        """Reject inconsistent day numbering, budget ranges and dietary counts."""
        numbers = [day.day_number for day in self.days]
        if numbers and sorted(numbers) != list(range(1, len(numbers) + 1)):
            raise ValueError("Event day numbers must be consecutive, starting at 1")
        if self.per_plate_min_inr > self.per_plate_max_inr and self.per_plate_max_inr > 0:
            raise ValueError("Minimum per-plate budget cannot exceed maximum")
        if self.budget_range_min_inr > self.budget_range_max_inr and self.budget_range_max_inr > 0:
            raise ValueError("Minimum total budget cannot exceed maximum")
        if any(count < 0 or count > self.guest_count for count in self.special_diets.values()):
            raise ValueError("Special-diet counts must be between zero and the total guest count")
        if any(not key.strip() or len(key) > 60 for key in self.special_diets):
            raise ValueError("Special-diet names must be between 1 and 60 characters")
        return self


class VendorAssignment(BaseModel):
    """A host-entered vendor offer for one event and service."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(min_length=1, max_length=80)
    category: VendorCategory
    place_id: str = Field(min_length=1, max_length=512)
    notes: str = Field(default="", max_length=2000)
    quoted_total_inr: float | None = Field(default=None, ge=0.0)
    category_budget_cap_inr: float | None = Field(default=None, ge=0.0)
    capacity: int | None = Field(default=None, ge=1, le=100_000)


class SavedQuote(BaseModel):
    """A written vendor quotation and optional finalized budget selection."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=80)
    vendor_id: str = Field(min_length=1, max_length=80)
    vendor_name: str = Field(min_length=1, max_length=120, pattern=r"\S")
    event_id: str = Field(min_length=1, max_length=80)
    category: VendorCategory
    original_inr: float = Field(ge=0, le=1e12, allow_inf_nan=False)
    finalized_inr: float | None = Field(default=None, ge=0, le=1e12, allow_inf_nan=False)
    description: str = Field(default="", max_length=4000)
    conditions: str = Field(default="", max_length=2000)
    notes: str = Field(default="", max_length=2000)
    budget_cap_inr: float | None = Field(default=None, ge=0, le=1e12, allow_inf_nan=False)
    selected: bool = False

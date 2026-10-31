from pydantic import BaseModel, ConfigDict, Field


class NormalizedQuoteItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160, description="Line item description")
    category: str = Field(min_length=1, max_length=80, description="Item category, e.g., Buffet, Live Counter, Beverages")
    unit_rate_inr: float = Field(ge=0.0, description="Unit cost in INR")
    quantity: float = Field(ge=0.0, description="Quantity or guest count multiplier")
    total_inr: float = Field(ge=0.0, description="Extended line item total in INR")
    is_optional: bool = Field(default=False, description="True if this item can be omitted to save costs")


class NormalizedQuote(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor_name: str = Field(min_length=1, max_length=120, description="Vendor or agency name")
    category: str = Field(min_length=1, max_length=80, description="Vendor service category (Catering, Decor, Venue, Photography)")
    raw_total_inr: float = Field(ge=0.0, description="Total quote amount as quoted")
    normalized_per_head_inr: float = Field(ge=0.0, description="Effective cost per guest")
    items: list[NormalizedQuoteItem] = Field(default_factory=list, max_length=200, description="Extracted line items")
    includes_gst: bool | None = Field(default=None, description="Whether the vendor marked applicable taxes as included")
    includes_generator_backup: bool | None = Field(default=None, description="Whether power backup is marked as included")
    includes_jain_counter: bool | None = Field(default=None, description="Whether separate Jain meal preparation is marked as included")
    includes_corkage: bool | None = Field(default=None, description="Whether any relevant corkage or glassware fee is marked as included")


class HiddenCostFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Name of the missing or hidden item")
    estimated_impact_inr: float | None = Field(default=None, ge=0.0, description="Vendor-entered or confirmed impact; null when no amount is known")
    description: str = Field(description="Explanation of why this is a risk for the event plan")
    severity: str = Field(description="Severity: LOW, MEDIUM, or HIGH")


class QuoteComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")

    normalized_quote: NormalizedQuote = Field(description="Parsed and normalized vendor quote")
    budget_allocated_max_inr: float = Field(ge=0.0, description="Budget cap allocated for this category")
    variance_inr: float = Field(description="Quote total minus allocated max (positive = over budget)")
    is_within_budget: bool = Field(description="True if variance_inr <= 0")
    hidden_cost_flags: list[HiddenCostFlag] = Field(default_factory=list, max_length=20, description="Identified missing inclusions")
    target_counter_offer_inr: float = Field(ge=0.0, description="Deterministic target counter-offer to fit budget")
    negotiation_script: str = Field(description="Grounded negotiation message for WhatsApp or Email")
    vendor_interview_questions: list[str] = Field(
        default_factory=list, description="5 sharp questions to ask the vendor"
    )


import type { components } from "./schema";

/** Supported service keys shared with plan and quotation APIs. */
export type VendorCategory = "venue" | "caterer" | "decorator" | "photographer" | "makeup" | "music" | "transport";
/** Supported event time-of-day choices. */
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";
type SubEventType = "HALDI" | "SANGEET" | "WEDDING" | "RECEPTION";

/** One selected event and its host-entered attendance and vendor needs. */
export interface PlanEvent {
  id: string;
  catalog_id: string | null;
  custom_name: string | null;
  time_slot: TimeSlot;
  guest_count: number | null;
  venue_type: string | null;
  vendor_categories: VendorCategory[];
}

interface EventDay {
  day_number: number;
  date: string | null;
  events: PlanEvent[];
}

/** Task dependencies and computed critical-path and event-date values. */
export interface TaskNode {
  id: string;
  title: string;
  category: string;
  sub_event?: SubEventType | null;
  event_id?: string | null;
  event_name?: string | null;
  event_date?: string | null;
  due_date?: string | null;
  lead_time_days?: number | null;
  budget_category?: string | null;
  duration_days: number;
  dependencies: string[];
  status: string;
  earliest_start: number;
  latest_start: number;
  slack_days: number;
  is_critical: boolean;
  hop_level: number;
}

/** Host-derived allocation range, contingency reserve and cap status. */
export interface BudgetBucket {
  category: string;
  allocated_min_inr: number;
  allocated_max_inr: number;
  contingency_inr: number;
  assumptions: string[];
  is_violated: boolean;
  category_budget_cap_inr?: number | null;
}

interface DietarySplit { regular: number; jain: number; vegan: number; kids: number }
interface AccessibilityNeeds { elderly_count: number; wheelchair_access_required: boolean; ground_floor_dining: boolean }

/** A branch-local written vendor offer for one event and category. */
export interface VendorAssignment {
  event_id: string;
  category: VendorCategory;
  place_id: string;
  notes: string;
  quoted_total_inr: number | null;
  category_budget_cap_inr: number | null;
  capacity: number | null;
}

/** Host-entered written quotation fields and optional budget selection. */
export interface SavedQuote {
  id: string; vendor_id: string; vendor_name: string; event_id: string; category: VendorCategory;
  original_inr: number; finalized_inr: number | null; description: string; conditions: string;
  notes: string; budget_cap_inr: number | null; selected: boolean;
}

/** Persisted plan inputs with the task and budget state computed by the API. */
export interface EventPlan {
  saved_quotes?: SavedQuote[];
  contingency_percent?: number;
  id: string;
  title: string;
  template: string;
  guest_count: number;
  total_budget_cap_inr: number;
  budget_range_min_inr: number;
  budget_range_max_inr: number;
  per_plate_min_inr: number;
  per_plate_max_inr: number;
  venue_capacity?: number | null;
  days_until_event: number;
  dietary_split: DietarySplit;
  accessibility: AccessibilityNeeds;
  sub_events: SubEventType[];
  budget_buckets: BudgetBucket[];
  tasks: TaskNode[];
  notes: string[];
  city: string;
  first_event_date: string | null;
  days: EventDay[];
  special_diets: Record<string, number>;
  accessibility_needs: string[];
  elder_members: number;
  vendor_assignments: VendorAssignment[];
  profile_hints?: Record<string, string[]>;
}

/** Public catalog metadata used to select events and describe task defaults. */
export interface CatalogEvent {
  id: string;
  display_name: string;
  typical_duration_minutes: number;
  time_of_day: TimeSlot;
  venue_type_hints: string[];
  vendor_categories_needed: VendorCategory[];
  guest_count_sensitivity: string;
  task_templates: Array<{ id: string; name: string; lead_time_days: number; dependencies: string[]; budget_category: string }>;
}

/** Validated intent fields supplied to the deterministic engine. */
export type PlanDelta = Partial<components["schemas"]["PlanDelta"]>;
/** Task and budget impacts returned by a deterministic plan operation. */
export type CascadeDiff = components["schemas"]["CascadeDiff"];
/** Budget recovery option with explicit adjustments and impact rationale. */
export type TradeOffOption = components["schemas"]["TradeOffOption"];
/** Host-transcribed quote fields accepted by the comparison endpoint. */
export type NormalizedQuote = components["schemas"]["NormalizedQuote"];
/** Written quote comparison against the host budget. */
export type QuoteComparison = components["schemas"]["QuoteComparison"];

/** Engine operation output shared by edits, vendor assignments and quote changes. */
export interface PlanMutationResponse {
  updated_plan: EventPlan;
  diff: CascadeDiff;
  tradeoff_options?: TradeOffOption[];
}

/** Public catalog data excludes internal tradition tags. */
export interface CatalogResponse { events: CatalogEvent[]; notice?: string }

/** Saved event choices that the host can use to start onboarding. */
export interface ExampleSelection { id: string; title: string; days: EventDay[]; requires_special_diets: boolean }
/** Saved catalog alias match offered for a custom event name. */
export interface MappingSuggestion { catalog_id: string; display_name: string; source: string }

/** Callbacks for the ordered replanning stream. */
export interface SSEReplanHandlers {
  onDelta?: (data: {
    delta: PlanDelta;
    source: string;
    degraded_mode: boolean;
    remaining_quota: number;
  }) => void;
  onEngineDiff?: (data: {
    updated_plan: EventPlan;
    diff: CascadeDiff;
    tradeoff_options: TradeOffOption[];
  }) => void;
  onRationale?: (data: {
    rationale: string;
    source: string;
    degraded_mode: boolean;
  }) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}


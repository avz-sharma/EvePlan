import type { components } from "./schema";

export type VendorCategory = "venue" | "caterer" | "decorator" | "photographer" | "makeup" | "music" | "transport";
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";
type SubEventType = "HALDI" | "SANGEET" | "WEDDING" | "RECEPTION";

export interface PlanEvent {
  id: string;
  catalog_id: string | null;
  custom_name: string | null;
  time_slot: TimeSlot;
  guest_count: number | null;
  venue_type: string | null;
  vendor_categories: VendorCategory[];
}

export interface EventDay {
  day_number: number;
  date: string | null;
  events: PlanEvent[];
}

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

export interface VendorAssignment {
  event_id: string;
  category: VendorCategory;
  place_id: string;
  notes: string;
  quoted_total_inr: number | null;
  category_budget_cap_inr: number | null;
  capacity: number | null;
}

export interface EventPlan {
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

export interface VendorSearchResult {
  place_id: string;
  display_name: string;
  formatted_address: string;
  location: { lat: number | null; lng: number | null };
  types: string[];
  maps_url: string;
}

export type PlanDelta = Partial<components["schemas"]["PlanDelta"]>;
export type CascadeDiff = components["schemas"]["CascadeDiff"];
export type TradeOffOption = components["schemas"]["TradeOffOption"];
export type NormalizedQuote = components["schemas"]["NormalizedQuote"];
export type QuoteComparison = components["schemas"]["QuoteComparison"];

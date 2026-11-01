import type { EventPlan, TimeSlot, VendorCategory } from "../api/types";

/** Supported event slots in their presentation order. */
export const TIME_SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
/** Supported vendor services shared by onboarding and the event editor. */
export const VENDOR_CATEGORIES: VendorCategory[] = ["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"];
/** Host-entered meal-count categories; choices never infer guest identity. */
export const DIETARY_CATEGORIES = ["jain", "halal", "vegetarian", "vegan", "no_alcohol"];

/** Create an incomplete local draft; the API validates it before final construction. */
export const blankPlan = (): EventPlan => ({
  id: "", title: "", template: "celebration", guest_count: 0, total_budget_cap_inr: 0,
  budget_range_min_inr: 0, budget_range_max_inr: 0, per_plate_min_inr: 0, per_plate_max_inr: 0,
  days_until_event: 0, dietary_split: { regular: 0, jain: 0, vegan: 0, kids: 0 },
  accessibility: { elderly_count: 0, wheelchair_access_required: false, ground_floor_dining: false },
  sub_events: [], budget_buckets: [], tasks: [], notes: [], city: "", first_event_date: null,
  days: [{ day_number: 1, date: null, events: [] }], special_diets: {}, accessibility_needs: [],
  elder_members: 0, vendor_assignments: [],
});

/** Create event identifiers with a fallback for browsers without randomUUID. */
export function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }


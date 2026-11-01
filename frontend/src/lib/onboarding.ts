import type { EventPlan, TimeSlot, VendorCategory } from "../api/types";

export const TIME_SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
export const VENDOR_CATEGORIES: VendorCategory[] = ["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"];
export const DIETARY_CATEGORIES = ["jain", "halal", "vegetarian", "vegan", "no_alcohol"];

export const blankPlan = (): EventPlan => ({
  id: "", title: "", template: "celebration", guest_count: 0, total_budget_cap_inr: 0,
  budget_range_min_inr: 0, budget_range_max_inr: 0, per_plate_min_inr: 0, per_plate_max_inr: 0,
  days_until_event: 0, dietary_split: { regular: 0, jain: 0, vegan: 0, kids: 0 },
  accessibility: { elderly_count: 0, wheelchair_access_required: false, ground_floor_dining: false },
  sub_events: [], budget_buckets: [], tasks: [], notes: [], city: "", first_event_date: null,
  days: [{ day_number: 1, date: null, events: [] }], special_diets: {}, accessibility_needs: [],
  elder_members: 0, vendor_assignments: [],
});

export function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }


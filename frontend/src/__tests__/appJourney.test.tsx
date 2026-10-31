// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { planActions } from "../state/planStore";
import type { EventPlan, NormalizedQuote, PlanEvent, VendorAssignment } from "../api/types";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import catalog from "../../../backend/app/engine/data/event_catalog.json";

const initial = saved.fixtures[0].updated_plan as EventPlan;
const stored = new Map<string, string>();
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  stored.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addListener() {}, removeListener() {} })));
  window.history.replaceState(null, "", "/#/overview");
  planActions.patch({ plan: null, forkedPlan: null, history: [], historyIndex: -1,
    lastDiff: null, lastDelta: null, tradeoffOptions: [], isLoading: false, quotesOpen: false });
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body ?? "{}")) as {
      plan: EventPlan; quote: NormalizedQuote; assignment: VendorAssignment;
      guest_count: number; event_id: string; event?: PlanEvent;
      allocated_budget_max_inr: number;
    };
    if (url.endsWith("/catalog")) return response({ events: catalog.events, notice: catalog._header });
    if (url.endsWith("/examples")) return response([{ id: "example", title: "Example celebration", days: initial.days.map(day => ({ ...day, events: day.events.map(event => ({ ...event, guest_count: null })) })), requires_special_diets: false }]);
    if (url.endsWith("/scenarios")) return response([]);
    if (url.endsWith("/build")) return response({ ...initial, ...body, tasks: initial.tasks, budget_buckets: initial.budget_buckets });
    if (url.endsWith("/events/edit")) return response({ updated_plan: { ...body.plan,
      days: body.plan.days.map(day => ({ ...day, events: day.events.map(event => event.id === body.event_id
        ? { ...event, guest_count: body.guest_count ?? event.guest_count, ...body.event } : event) })) }, diff: saved.fixtures[0].diff });
    if (url.endsWith("/vendors/assign")) return response({ updated_plan: { ...body.plan, vendor_assignments: [body.assignment] }, diff: saved.fixtures[0].diff });
    if (url.endsWith("/compare")) return response({ normalized_quote: body.quote,
      budget_allocated_max_inr: body.allocated_budget_max_inr, variance_inr: 0, is_within_budget: true,
      target_counter_offer_inr: body.quote.raw_total_inr, hidden_cost_flags: [],
      negotiation_script: "Confirm the written scope.", vendor_interview_questions: ["What is included?"] });
    if (url.endsWith("/stream")) {
      const events = [
        ["delta", { delta: { guest_count_delta: 40 }, degraded_mode: true }],
        ["engine_diff", { updated_plan: { ...body.plan, guest_count: body.plan.guest_count + 40 }, diff: saved.fixtures[0].diff, tradeoff_options: [] }],
        ["rationale", { rationale: "Guest count updated from your request." }],
      ];
      return new Response(events.map(([name, value]) => `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`).join(""));
    }
    throw new Error(`Unexpected test API route: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const change = (label: string, value: string, scope: Pick<typeof screen, "getByLabelText"> = screen) => fireEvent.change(scope.getByLabelText(label, { exact: true }), { target: { value } });

it("preserves wizard review, streamed changes, undo/redo, vendor picks and quote comparison", async () => {
  render(<App />);
  const dialog = within(await screen.findByRole("dialog", { name: "Build a celebration plan" }));
  fireEvent.click(await dialog.findByRole("button", { name: "Example celebration" }));
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  for (const [label, value] of Object.entries({ "Plan name": "Accessible celebration", "Total guests": "120", City: "Pune",
    "Total budget minimum (₹)": "1000000", "Total budget maximum (₹)": "1500000", "First event date": "2027-05-01" })) change(label, value, dialog);
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  change("Per-plate budget minimum (₹)", "700", dialog);
  change("Per-plate budget maximum (₹)", "1000", dialog);
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  expect(dialog.getByRole("heading", { name: "Review" })).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Build plan" }));
  await screen.findByRole("heading", { name: "Accessible celebration" });
  change("Describe a change", "+40 guests");
  fireEvent.click(screen.getByRole("button", { name: "Describe a change" }));
  await screen.findByText("Guest count updated from your request.");
  expect(JSON.parse(stored.get("eveplan_active_plan")!).guest_count).toBe(160);
  fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[0]);
  expect(JSON.parse(stored.get("eveplan_active_plan")!).guest_count).toBe(120);
  fireEvent.click(screen.getAllByRole("button", { name: "Redo" })[0]);
  expect(JSON.parse(stored.get("eveplan_active_plan")!).guest_count).toBe(160);
  fireEvent.click(screen.getByRole("tab", { name: "Vendors" }));
  await screen.findByRole("heading", { name: "Manual vendor entry" });
  change("Vendor name", "Host venue");
  change("Your quote (₹)", "100000");
  await waitFor(() => expect(screen.getByRole("button", { name: "Pick manual vendor for this event" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Pick manual vendor for this event" }));
  await waitFor(() => expect(JSON.parse(stored.get("eveplan_active_plan")!).vendor_assignments).toHaveLength(1));
  fireEvent.click(screen.getByRole("tab", { name: "Quotes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Snap a quote" }));
  const quote = within(await screen.findByRole("dialog", { name: "Compare a vendor quote" }));
  change("Vendor name", "Host caterer", quote);
  change("Quote total (₹)", "100000", quote);
  change("Per-attendee amount (₹, from quote)", "800", quote);
  fireEvent.click(quote.getByRole("button", { name: "Compare quote" }));
  await quote.findByText("Confirm the written scope.");
  fireEvent.click(quote.getByRole("button", { name: "Compare another quote" }));
  expect(quote.getByLabelText("Vendor name", { exact: true })).toBeTruthy();
});

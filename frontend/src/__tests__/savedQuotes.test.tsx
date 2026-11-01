// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan, SavedQuote } from "../api/types";
import { SavedQuotes } from "../components/SavedQuotes";
import { planActions, usePlanStore } from "../state/planStore";
import { renderHook } from "@testing-library/react";

const base = saved.fixtures[0].updated_plan as EventPlan;
const eventId = base.days[0].events[0].id;
const quote: SavedQuote = { id: "q1", vendor_id: "v1", vendor_name: "Vendor A", event_id: eventId, category: "decorator", original_inr: 120000, finalized_inr: 100000, description: "Flowers", conditions: "", notes: "", selected: false, budget_cap_inr: 150000 };
let plan: EventPlan;
beforeEach(() => {
  window.location.hash = "";
  plan = { ...base, saved_quotes: [quote] };
  planActions.setOwner(null); planActions.update(plan);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    let quotes = body.plan.saved_quotes as SavedQuote[];
    if (body.operation === "save") quotes = [...quotes.filter(q => q.id !== body.quote.id), body.quote];
    if (body.operation === "remove") quotes = quotes.filter(q => q.id !== body.quote_id);
    if (body.operation === "select") quotes = quotes.map(q => ({ ...q, selected: q.id === body.quote_id }));
    return new Response(JSON.stringify({ updated_plan: { ...body.plan, saved_quotes: quotes }, diff: null }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });

it("saves an alternative, prompts only at the second vendor and supports keyboard dismissal", async () => {
  const view = render(<SavedQuotes />);
  fireEvent.click(screen.getByText("Add a Manual Quote"));
  change("Vendor name", "Vendor B"); change("Vendor's quoted price (₹)", "90000");
  expect(screen.getByText("Save & Select for Budget").hasAttribute("disabled")).toBe(true);
  change("Negotiated/finalized price (₹)", "80000");
  change("Description / inclusions", "Lights"); change("Exclusions / conditions", "Travel extra"); change("Notes", "Ask about taxes");
  fireEvent.click(screen.getByText("Save Quote"));
  const dialog = await screen.findByRole("dialog", { name: "Compare vendor quotations" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await axe(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(dialog.isConnected).toBe(false);
  expect(screen.getAllByText("Saved alternative")).toHaveLength(2);
  fireEvent.click(screen.getAllByText("Edit")[1]);
  change("Notes", "Updated"); fireEvent.click(screen.getByText("Save Quote"));
  await waitFor(() => expect(screen.getByText("Updated")).toBeTruthy());
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getAllByText("Remove")[1]);
  await waitFor(() => expect(screen.queryByText("Vendor B")).toBeNull());
});

it("filters events by day and exposes all categories", () => {
  render(<SavedQuotes />);
  expect(within(screen.getByLabelText("Category")).getAllByRole("option")).toHaveLength(7);
  change("Day", "2");
  expect(within(screen.getByLabelText("Event")).getAllByRole("option").map(o => o.getAttribute("value"))).toEqual(base.days[1].events.map(e => e.id));
  expect(screen.queryByText("Vendor A")).toBeNull();
});

it("isolates branch changes and includes quotation edits in undo/redo", async () => {
  act(() => planActions.fork());
  const { result } = renderHook(() => usePlanStore(s => s));
  await act(() => planActions.mutateQuote("select", { quote_id: "q1" }, "B"));
  expect(result.current.plan?.saved_quotes?.[0].selected).toBe(false);
  expect(result.current.forkedPlan?.saved_quotes?.[0].selected).toBe(true);
  await act(() => planActions.mutateQuote("select", { quote_id: "q1" }));
  expect(result.current.plan?.saved_quotes?.[0].selected).toBe(true);
  act(() => planActions.undo()); expect(result.current.plan?.saved_quotes?.[0].selected).toBe(false);
  act(() => planActions.redo()); expect(result.current.plan?.saved_quotes?.[0].selected).toBe(true);
  act(() => planActions.switchFork());
  act(() => planActions.undo()); expect(result.current.plan?.saved_quotes?.[0].selected).toBe(false);
  expect(result.current.forkedPlan?.saved_quotes?.[0].selected).toBe(true);
});

it("shows missing details, selects quotes and invalidates old AI suggestions", async () => {
  planActions.update({ ...plan, saved_quotes: [quote, { ...quote, id: "q2", vendor_id: "v2", vendor_name: "Vendor B" }] });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ analysis: { differences: ["Different scope"], missing_details: ["Taxes not specified"], follow_up_questions: ["Delivery included?"], recommendation: "Insufficient information to choose a winner" }, message: "AI suggestions" })));
  render(<SavedQuotes comparison />);
  expect(screen.getAllByText("Not specified").length).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Analyze with AI"));
  await screen.findByText("Different scope");
  expect(screen.getByText("Analyze with AI").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getAllByText("Select for Budget")[0]);
  await screen.findByText("Inputs changed. Analyze again for current suggestions.");
  expect(screen.queryByText("Different scope")).toBeNull();
});

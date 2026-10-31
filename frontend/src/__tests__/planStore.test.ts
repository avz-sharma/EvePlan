// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan } from "../api/types";
import { planActions, usePlanStore } from "../state/planStore";

const plan = saved.fixtures[0].updated_plan as EventPlan;
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key) });
  planActions.setOwner(null);
  planActions.patch({ plan, forkedPlan: null, history: [plan], historyIndex: 0 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("preserves undo/redo and excludes derived hints from saved plans", () => {
  const { result } = renderHook(() => usePlanStore(state => state.plan));
  act(() => planActions.update({ ...plan, guest_count: plan.guest_count + 40 }));
  expect(result.current?.guest_count).toBe(plan.guest_count + 40);
  act(() => planActions.undo());
  expect(result.current).toBe(plan);
  act(() => planActions.redo());
  expect(result.current?.guest_count).toBe(plan.guest_count + 40);
  expect(JSON.parse(localStorage.getItem("eveplan_active_plan")!)).not.toHaveProperty("profile_hints");
});

it("does not render plan subscribers for unrelated store changes", () => {
  let renders = 0;
  renderHook(() => { renders++; return usePlanStore(state => state.plan?.tasks); });
  act(() => planActions.patch({ toast: "A notification", quotesOpen: true }));
  expect(renders).toBe(1);
});

it("keeps vendor picks isolated to their branch", async () => {
  act(() => planActions.fork());
  const assignment = { event_id: plan.days[0].events[0].id, category: "venue" as const,
    place_id: "manual:host-entered", notes: "", quoted_total_inr: null,
    category_budget_cap_inr: null, capacity: null };
  const updated = { ...plan, vendor_assignments: [assignment] };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ updated_plan: updated, diff: null }))));
  const { result } = renderHook(() => usePlanStore(state => state.forkedPlan));
  await act(() => planActions.assignVendor(assignment, "B"));
  expect(result.current?.vendor_assignments).toEqual([assignment]);
  const active = renderHook(() => usePlanStore(state => state.plan));
  expect(active.result.current).toBe(plan);
});

it("keeps saved plans separate for each signed-in account", () => {
  planActions.setOwner("host-a"); planActions.update(plan);
  planActions.setOwner("host-b"); expect(planActions.restore()).toBe(false);
  planActions.update({ ...plan, title: "Host B" });
  planActions.setOwner("host-a"); expect(planActions.restore()).toBe(true);
  expect(renderHook(() => usePlanStore(state => state.plan)).result.current?.title).toBe(plan.title);
  planActions.setOwner(null);
});

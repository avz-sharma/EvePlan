import { useSyncExternalStore } from "react";
import type { CascadeDiff, EventPlan, PlanDelta, TradeOffOption, VendorAssignment } from "../api/types";
import { apiUrl } from "../api/client";

interface PlanState {
  plan: EventPlan | null;
  forkedPlan: EventPlan | null;
  history: EventPlan[];
  historyIndex: number;
  lastDelta: PlanDelta | null;
  lastDiff: CascadeDiff | null;
  tradeoffOptions: TradeOffOption[];
  previewAdjustments: Record<string, number> | null;
  isLoading: boolean;
  quotesOpen: boolean;
  toast: string | null;
}

const initialState: PlanState = { plan: null, forkedPlan: null, history: [], historyIndex: -1,
  lastDelta: null, lastDiff: null, tradeoffOptions: [], previewAdjustments: null,
  isLoading: false, quotesOpen: false, toast: null };
let state = initialState;
const listeners = new Set<() => void>();
let toastTimer: number | undefined;

function persist(key: string, plan: EventPlan | null) {
  try {
    if (!plan) { localStorage.removeItem(key); return; }
    const saved = { ...plan };
    delete saved.profile_hints;
    localStorage.setItem(key, JSON.stringify(saved));
  } catch { /* A plan remains usable when browser storage is disabled. */ }
}

type Action = { type: "patch"; patch: Partial<PlanState> } | { type: "update"; plan: EventPlan; patch?: Partial<PlanState> };
function reducer(current: PlanState, action: Action): PlanState {
  if (action.type === "patch") return { ...current, ...action.patch };
  const history = [...current.history.slice(0, current.historyIndex + 1), action.plan];
  return { ...current, ...action.patch, plan: action.plan, history, historyIndex: history.length - 1 };
}

function dispatch(action: Action) {
  const before = state;
  state = reducer(state, action);
  if (state.plan !== before.plan) persist("eveplan_active_plan", state.plan);
  if (state.forkedPlan !== before.forkedPlan) persist("eveplan_forked_plan", state.forkedPlan);
  listeners.forEach(listener => listener());
}
const patch = (next: Partial<PlanState>) => dispatch({ type: "patch", patch: next });
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export function usePlanStore<T>(select: (current: PlanState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}
export function useCurrentPlan(): EventPlan {
  const plan = usePlanStore(current => current.plan);
  if (!plan) throw new Error("The plan view requires a built plan.");
  return plan;
}

function notify(message: string) {
  window.clearTimeout(toastTimer);
  patch({ toast: message });
  toastTimer = window.setTimeout(() => patch({ toast: null }), 2600);
}
function historyStep(direction: number) {
  const index = state.historyIndex + direction;
  if (index < 0 || index >= state.history.length) return;
  patch({ plan: state.history[index], historyIndex: index });
  notify(direction < 0 ? "Change undone" : "Change restored");
}

export const planActions = {
  patch, notify,
  update: (plan: EventPlan, patch?: Partial<PlanState>) => dispatch({ type: "update", plan, patch }),
  updated: (plan: EventPlan, diff: CascadeDiff) => {
    dispatch({ type: "update", plan, patch: { lastDiff: diff } });
  },
  restore: () => {
    const saved = localStorage.getItem("eveplan_active_plan");
    if (!saved) return false;
    try {
      const plan = JSON.parse(saved) as EventPlan;
      delete plan.profile_hints;
      if (!Array.isArray(plan.days) || !plan.days.length || !Array.isArray(plan.tasks)) throw new Error("Invalid plan");
      const fork = localStorage.getItem("eveplan_forked_plan");
      const forkedPlan = fork ? JSON.parse(fork) as EventPlan : null;
      if (forkedPlan) delete forkedPlan.profile_hints;
      patch({ plan, forkedPlan, history: [plan], historyIndex: 0 });
      return true;
    } catch { localStorage.removeItem("eveplan_active_plan"); return false; }
  },
  undo: () => historyStep(-1), redo: () => historyStep(1),
  fork: () => { if (state.plan) { patch({ forkedPlan: structuredClone(state.plan) }); notify("Plan fork created"); } },
  switchFork: () => {
    if (!state.forkedPlan) return;
    patch({ plan: state.forkedPlan, forkedPlan: state.plan }); notify("Plans switched");
  },
  clearFork: () => patch({ forkedPlan: null }),
  openQuotes: () => patch({ quotesOpen: true }),
  preview: (previewAdjustments: Record<string, number> | null) => patch({ previewAdjustments }),
  applyTradeOff: (option: TradeOffOption) => {
    const plan = state.plan;
    if (!plan) return;
    const budget_buckets = plan.budget_buckets.map(bucket => ({ ...bucket,
      allocated_max_inr: Math.max(0, bucket.allocated_max_inr + (option.bucket_adjustments[bucket.category] || 0)) }));
    planActions.update({ ...plan, guest_count: Math.max(1, plan.guest_count + option.guest_count_adjustment),
      budget_buckets, notes: [...plan.notes, `Applied trade-off: ${option.title}`] });
    patch({ tradeoffOptions: state.tradeoffOptions.filter(item => item.id !== option.id), previewAdjustments: null });
    notify("Trade-off applied");
  },
  assignVendor: async (assignment: VendorAssignment, branch: "A" | "B", signal?: AbortSignal) => {
    const plan = branch === "B" ? state.forkedPlan : state.plan;
    if (!plan) return;
    const response = await fetch(apiUrl("/api/plan/vendors/assign"), { method: "POST", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, assignment }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Vendor could not be assigned.");
    patch({ lastDiff: payload.diff as CascadeDiff });
    if (branch === "A") planActions.update(payload.updated_plan as EventPlan);
    else patch({ forkedPlan: payload.updated_plan as EventPlan });
    notify("Vendor assigned; budget and tasks updated");
  },
};

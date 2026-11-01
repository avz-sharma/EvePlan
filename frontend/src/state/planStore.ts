import type { PlanMutationResponse } from "../api/types";
import { useSyncExternalStore } from "react";
import type { CascadeDiff, EventPlan, PlanDelta, TradeOffOption, SavedQuote, VendorAssignment } from "../api/types";
import { apiUrl, readResponse } from "../api/client";

interface PlanState {
  plan: EventPlan | null;
  forkedPlan: EventPlan | null;
  history: EventPlan[];
  historyIndex: number;
  forkHistory: EventPlan[];
  forkHistoryIndex: number;
  lastDelta: PlanDelta | null;
  lastDiff: CascadeDiff | null;
  tradeoffOptions: TradeOffOption[];
  previewAdjustments: Record<string, number> | null;
  isLoading: boolean;
  quotesOpen: boolean;
  toast: string | null;
}

const initialState: PlanState = { plan: null, forkedPlan: null, history: [], historyIndex: -1, forkHistory: [], forkHistoryIndex: -1,
  lastDelta: null, lastDiff: null, tradeoffOptions: [], previewAdjustments: null,
  isLoading: false, quotesOpen: false, toast: null };
let state = initialState;
const listeners = new Set<() => void>();
const TOAST_DURATION_MS = 2600;
let toastTimer: number | undefined;

let owner: string | null = null;
const storageKey = (key: string) => owner ? `eveplan:${encodeURIComponent(owner)}:${key}` : key;

function persist(key: string, plan: EventPlan | null) {
  try {
    if (!plan) { localStorage.removeItem(storageKey(key)); return; }
    const saved = { ...plan };
    delete saved.profile_hints;
    localStorage.setItem(storageKey(key), JSON.stringify(saved));
  } catch { notify("Browser storage is unavailable. Changes will last only for this session."); }
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

/** Subscribe to a stable selected store snapshot without unrelated component renders. */
export function usePlanStore<T>(select: (current: PlanState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}
/** Require a built plan in views mounted after onboarding. */
export function useCurrentPlan(): EventPlan {
  const plan = usePlanStore(current => current.plan);
  if (!plan) throw new Error("The plan view requires a built plan.");
  return plan;
}

function notify(message: string) {
  window.clearTimeout(toastTimer);
  patch({ toast: message });
  toastTimer = window.setTimeout(() => patch({ toast: null }), TOAST_DURATION_MS);
}
function historyStep(direction: number) {
  const index = state.historyIndex + direction;
  if (index < 0 || index >= state.history.length) return;
  patch({ plan: state.history[index], historyIndex: index });
  notify(direction < 0 ? "Change undone" : "Change restored");
}

/** Update immutable plan snapshots, account storage and independent branch histories. */
export const planActions = {
  patch, notify,
  setOwner: (id: string | null) => { owner = id; state = { ...initialState }; listeners.forEach(listener => listener()); },
  update: (plan: EventPlan, patch?: Partial<PlanState>) => dispatch({ type: "update", plan, patch }),
  updated: (plan: EventPlan, diff: CascadeDiff) => {
    dispatch({ type: "update", plan, patch: { lastDiff: diff } });
  },
  restore: () => {
    try {
      const saved = localStorage.getItem(storageKey("eveplan_active_plan"));
      if (!saved) return false;
      const plan = JSON.parse(saved) as EventPlan;
      delete plan.profile_hints;
      if (!Array.isArray(plan.days) || !plan.days.length || !Array.isArray(plan.tasks)) throw new Error("Invalid plan");
      const fork = localStorage.getItem(storageKey("eveplan_forked_plan"));
      const forkedPlan = fork ? JSON.parse(fork) as EventPlan : null;
      if (forkedPlan) delete forkedPlan.profile_hints;
      patch({ plan, forkedPlan, history: [plan], historyIndex: 0, forkHistory: forkedPlan ? [forkedPlan] : [], forkHistoryIndex: forkedPlan ? 0 : -1 });
      return true;
    } catch {
      try { localStorage.removeItem(storageKey("eveplan_active_plan")); }
      catch { /* Storage may forbid both reads and removal; keep the in-memory plan usable. */ }
      notify("Saved plans could not be loaded. You can still create a plan.");
      return false;
    }
  },
  undo: () => historyStep(-1), redo: () => historyStep(1),
  fork: () => { if (state.plan) { const forkedPlan = structuredClone(state.plan); patch({ forkedPlan, forkHistory: [forkedPlan], forkHistoryIndex: 0 }); notify("Plan fork created"); } },
  switchFork: () => {
    if (!state.forkedPlan) return;
    patch({ plan: state.forkedPlan, forkedPlan: state.plan, history: state.forkHistory.length ? state.forkHistory : [state.forkedPlan], historyIndex: Math.max(0, state.forkHistoryIndex), forkHistory: state.history, forkHistoryIndex: state.historyIndex }); notify("Plans switched");
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
  mutateQuote: async (operation: "save" | "select" | "remove" | "contingency", values: { quote?: SavedQuote; quote_id?: string; contingency_percent?: number }, branch: "A" | "B" = "A") => {
    const plan = branch === "B" ? state.forkedPlan : state.plan;
    if (!plan) throw new Error("Plan is unavailable.");
    const response = await fetch(apiUrl("/api/plan/quotes/edit"), { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, operation, ...values }) });
    const payload = await readResponse<PlanMutationResponse>(response, "Check the quotation values.");
    if ((branch === "B" ? state.forkedPlan : state.plan) !== plan) throw new Error("Plan changed while saving. Please retry.");
    if (branch === "A") planActions.updated(payload.updated_plan, payload.diff);
    else { const history = [...state.forkHistory.slice(0, state.forkHistoryIndex + 1), payload.updated_plan as EventPlan]; patch({ forkedPlan: payload.updated_plan, lastDiff: payload.diff, forkHistory: history, forkHistoryIndex: history.length - 1 }); }
  },
  assignVendor: async (assignment: VendorAssignment, branch: "A" | "B", signal?: AbortSignal) => {
    const plan = branch === "B" ? state.forkedPlan : state.plan;
    if (!plan) return;
    const response = await fetch(apiUrl("/api/plan/vendors/assign"), { method: "POST", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, assignment }) });
    const payload = await readResponse<PlanMutationResponse>(response, "Vendor could not be assigned.");
    patch({ lastDiff: payload.diff as CascadeDiff });
    if (branch === "A") planActions.update(payload.updated_plan as EventPlan);
    else patch({ forkedPlan: payload.updated_plan as EventPlan });
    notify("Vendor assigned; budget and tasks updated");
  },
};

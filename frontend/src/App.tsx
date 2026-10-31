import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, GitFork, Redo2, Undo2, Menu, PlusCircle, RefreshCw } from "lucide-react";
import type { EventPlan, CascadeDiff, PlanDelta, TradeOffOption, BudgetBucket, VendorAssignment } from "./api/types";
import { apiUrl } from "./api/client";
import { streamReplan } from "./api/sseClient";
import { tabs, type TabId } from "./tabs.config";
import { Tabs } from "./components/ui/Tabs";
import { Banner, Button, GlassPanel, IconButton, Skeleton, Stat, Toast } from "./components/ui";
import { LazyQuoteModal as VendorQuoteModal, LazyWizard as OnboardingWizard } from "./components/LazyDialogs";
import type { PlanViewProps } from "./views/types";
import { formatCompactMoney, formatNumber } from "./lib/format";

const panels = {
  overview: lazy(() => import("./views/OverviewTab").then((module) => ({ default: module.OverviewTab }))),
  events: lazy(() => import("./views/EventsTab").then((module) => ({ default: module.EventsTab }))),
  budget: lazy(() => import("./views/BudgetTab").then((module) => ({ default: module.BudgetTab }))),
  timeline: lazy(() => import("./views/TimelineTab").then((module) => ({ default: module.TimelineTab }))),
  vendors: lazy(() => import("./views/VendorsTab").then((module) => ({ default: module.VendorsTab }))),
  scenarios: lazy(() => import("./views/ScenariosTab").then((module) => ({ default: module.ScenariosTab }))),
  quotes: lazy(() => import("./views/QuotesTab").then((module) => ({ default: module.QuotesTab }))),
  "how-it-works": lazy(() => import("./views/HowItWorksTab").then((module) => ({ default: module.HowItWorksTab }))),
} satisfies Record<TabId, React.LazyExoticComponent<React.ComponentType<PlanViewProps>>>;

const selectedTab = (): TabId => {
  const id = window.location.hash.replace(/^#\/?/, "") as TabId;
  return tabs.some((tab) => tab.id === id) ? id : "overview";
};

const serializeStoredPlan = (plan: EventPlan): string => {
  const { profile_hints: _derivedProfileHints, ...persistedPlan } = plan;
  return JSON.stringify(persistedPlan);
};

const restoreStoredPlan = (serialized: string): EventPlan => {
  const parsed = JSON.parse(serialized) as EventPlan;
  delete parsed.profile_hints;
  return parsed;
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(selectedTab);
  const [isElderMode, setIsElderMode] = useState(false);
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [forkedPlan, setForkedPlan] = useState<EventPlan | null>(null);
  const [history, setHistory] = useState<EventPlan[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastDelta, setLastDelta] = useState<PlanDelta | null>(null);
  const [lastDiff, setLastDiff] = useState<CascadeDiff | null>(null);
  const [tradeoffOptions, setTradeoffOptions] = useState<TradeOffOption[]>([]);
  const [previewAdjustments, setPreviewAdjustments] = useState<Record<string, number> | null>(null);
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [isDegraded, setIsDegraded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [streamedRationale, setStreamedRationale] = useState("");
  const [retryScenario, setRetryScenario] = useState<{ delta: PlanDelta; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => { document.documentElement.classList.toggle("elder-friendly-mode", isElderMode); }, [isElderMode]);
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/overview");
    const sync = () => setActiveTab(selectedTab()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, []);
  const selectTab = (id: string) => { const next = id as TabId; setActiveTab(next); window.location.hash = `/${next}`; };
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };

  const updatePlanWithHistory = useCallback((newPlan: EventPlan) => {
    setPlan(newPlan);
    try { localStorage.setItem("eveplan_active_plan", serializeStoredPlan(newPlan)); } catch { /* Storage can be disabled; the current plan remains usable. */ }
    const next = history.slice(0, historyIndex + 1); next.push(newPlan); setHistory(next); setHistoryIndex(next.length - 1);
  }, [history, historyIndex]);

  const initializeDefaultPlan = useCallback(async () => {
    setIsLoading(true); setIsDegraded(false); setStatusMessage("");
    try {
      const saved = localStorage.getItem("eveplan_active_plan");
      if (saved) {
        try {
          const parsed = restoreStoredPlan(saved);
          if (Array.isArray(parsed.days) && parsed.days.length > 0 && Array.isArray(parsed.tasks)) {
            setPlan(parsed); setHistory([parsed]); setHistoryIndex(0);
            const forked = localStorage.getItem("eveplan_forked_plan");
            if (forked) {
              const restoredFork = restoreStoredPlan(forked);
              setForkedPlan(restoredFork);
              localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(restoredFork));
            }
            localStorage.setItem("eveplan_active_plan", serializeStoredPlan(parsed));
            setIsLoading(false); return;
          }
          localStorage.removeItem("eveplan_active_plan");
        } catch { localStorage.removeItem("eveplan_active_plan"); }
      }
      setIsOnboardingOpen(true);
    } catch (error) { setIsDegraded(true); setStatusMessage(error instanceof Error ? error.message : "Plan could not be loaded. Please retry."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void initializeDefaultPlan(); }, []); // initial restore or baseline request

  const handleUndo = () => { if (historyIndex <= 0) return; const index = historyIndex - 1; const previous = history[index]; setPlan(previous); setHistoryIndex(index); localStorage.setItem("eveplan_active_plan", serializeStoredPlan(previous)); showToast("Change undone"); };
  const handleRedo = () => { if (historyIndex >= history.length - 1) return; const index = historyIndex + 1; const next = history[index]; setPlan(next); setHistoryIndex(index); localStorage.setItem("eveplan_active_plan", serializeStoredPlan(next)); showToast("Change restored"); };

  const handleNaturalLanguageSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!plan || !naturalLanguageInput.trim() || isLoading) return;
    const prompt = naturalLanguageInput.trim(); setNaturalLanguageInput(""); setRetryScenario(null); setStreamedRationale(""); setIsLoading(true); setIsDegraded(false); setStatusMessage("");
    await streamReplan(plan, prompt, {
      onDelta: ({ delta, degraded_mode }) => { setLastDelta(delta); setIsDegraded(degraded_mode); setStatusMessage(degraded_mode ? "An offline fallback was used to interpret this change." : ""); },
      onEngineDiff: ({ updated_plan, diff, tradeoff_options }) => { setLastDiff(diff); setTradeoffOptions(tradeoff_options); updatePlanWithHistory(updated_plan); },
      onRationale: ({ rationale }) => { setStreamedRationale(rationale); setIsLoading(false); },
      onError: () => { setNaturalLanguageInput(prompt); setIsLoading(false); setIsDegraded(true); setStatusMessage("We could not apply that change."); },
      onComplete: () => setIsLoading(false),
    });
  };

  const handleTriggerScenario = async (scenario: { delta: PlanDelta; label: string }) => {
    if (!plan || isLoading) return; setRetryScenario(null); setIsDegraded(false); setStatusMessage(""); setIsLoading(true);
    try {
      const response = await fetch(apiUrl("/api/plan/replan"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, delta: scenario.delta }) });
      if (!response.ok) throw new Error();
      const result = await response.json(); setLastDelta(scenario.delta); setLastDiff(result.diff); setTradeoffOptions(result.tradeoff_options || []); updatePlanWithHistory(result.updated_plan); setStatusMessage("");
    } catch { setRetryScenario(scenario); setIsDegraded(true); setStatusMessage("We could not apply that change."); }
    finally { setIsLoading(false); }
  };

  const handleApplyTradeOff = (option: TradeOffOption) => {
    if (!plan) return;
    const budget_buckets = plan.budget_buckets.map((bucket: BudgetBucket) => ({ ...bucket, allocated_max_inr: Math.max(0, bucket.allocated_max_inr + (option.bucket_adjustments[bucket.category] || 0)) }));
    updatePlanWithHistory({ ...plan, guest_count: Math.max(1, plan.guest_count + option.guest_count_adjustment), budget_buckets, notes: [...(plan.notes || []), `Applied trade-off: ${option.title}`] });
    setTradeoffOptions((current) => current.filter((item) => item.id !== option.id)); setPreviewAdjustments(null); showToast("Trade-off applied");
  };

  const handlePlanUpdated = (updatedPlan: EventPlan, diff: CascadeDiff) => { setLastDiff(diff); updatePlanWithHistory(updatedPlan); };

  const handleAssignVendor = async (assignment: VendorAssignment, branch: "A" | "B") => {
    const sourcePlan = branch === "B" ? forkedPlan : plan;
    if (!sourcePlan) return;
    const response = await fetch(apiUrl("/api/plan/vendors/assign"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: sourcePlan, assignment }) });
    const payload = await response.json();
    if (!response.ok) { setStatusMessage(payload.detail || "Vendor could not be assigned."); throw new Error(payload.detail || "Vendor could not be assigned."); }
    setLastDiff(payload.diff);
    if (branch === "A") updatePlanWithHistory(payload.updated_plan as EventPlan);
    else { setForkedPlan(payload.updated_plan as EventPlan); localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(payload.updated_plan as EventPlan)); }
    showToast("Vendor assigned; budget and tasks updated");
  };

  const contingency = useMemo(() => plan?.budget_buckets.reduce((sum, bucket) => sum + bucket.contingency_inr, 0) ?? 0, [plan]);
  const cateringBudget = plan?.budget_buckets.find((bucket) => bucket.category.includes("Catering"))?.allocated_max_inr ?? null;
  const props: PlanViewProps | null = plan ? {
    plan, lastDelta, lastDiff, tradeoffOptions, previewAdjustments, onPreview: setPreviewAdjustments, onApplyTradeOff: handleApplyTradeOff,
    forkedPlan, onFork: () => { const fork = structuredClone(plan); setForkedPlan(fork); localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(fork)); showToast("Plan fork created"); },
    onSwitchFork: () => { if (forkedPlan) { const current = plan; setPlan(forkedPlan); setForkedPlan(current); localStorage.setItem("eveplan_active_plan", serializeStoredPlan(forkedPlan)); localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(current)); showToast("Plans switched"); } },
    onClearFork: () => { setForkedPlan(null); localStorage.removeItem("eveplan_forked_plan"); }, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1,
    history, historyIndex, onUndo: handleUndo, onRedo: handleRedo, onOpenQuotes: () => setIsVendorModalOpen(true),
    onTriggerScenario: handleTriggerScenario, onPlanUpdated: handlePlanUpdated, onAssignVendor: handleAssignVendor, isLoading,
  } : null;

  return <div className="app-shell relative">
    <div className="app-backdrop" aria-hidden="true"><span /></div>
    <header className="app-header glass-panel border-x-0 border-t-0 rounded-none">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-[160px] items-center gap-3"><img src="/eveplan-logo.png" alt="" aria-hidden="true" width="56" height="56" className="size-14 rounded-xl bg-white/80 object-contain p-1" /><div><div className="font-semibold text-accent">EvePlan</div><div className="max-w-52 truncate text-xs text-muted">{plan?.title ?? "Celebration planner"}</div></div></div>
        <nav className="order-3 w-full min-w-0 lg:order-2 lg:w-auto"><Tabs tabs={[...tabs]} value={activeTab} onChange={selectTab} /></nav>
        <div className="hidden items-center gap-2 lg:order-3 lg:flex">
          <IconButton label="Undo" onClick={handleUndo} disabled={historyIndex <= 0}><Undo2 size={18} /></IconButton><IconButton label="Redo" onClick={handleRedo} disabled={historyIndex >= history.length - 1}><Redo2 size={18} /></IconButton>
          <IconButton label="Fork current plan" onClick={() => { if (plan) { const fork = structuredClone(plan); setForkedPlan(fork); localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(fork)); showToast("Plan fork created"); } }} disabled={!plan}><GitFork size={18} /></IconButton>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line/70 bg-white/45 px-3 text-sm"><Eye size={16} /><span>Elder-friendly</span><input type="checkbox" checked={isElderMode} onChange={(event) => setIsElderMode(event.target.checked)} /></label>
          <Button variant="quiet" onClick={() => setIsOnboardingOpen(true)} aria-label="Start a new plan"><PlusCircle size={17} />New plan</Button>
          <IconButton label="Reload plan" onClick={() => void initializeDefaultPlan()}><RefreshCw size={17} /></IconButton>
        </div>
        <details className="relative lg:hidden"><summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line bg-white/70" aria-label="More plan actions"><Menu size={18} /></summary><div className="absolute right-0 top-12 z-40 grid min-w-52 gap-2 rounded-2xl border border-line bg-white p-3 shadow-lg"><Button onClick={handleUndo} disabled={historyIndex <= 0}><Undo2 size={16} />Undo</Button><Button onClick={handleRedo} disabled={historyIndex >= history.length - 1}><Redo2 size={16} />Redo</Button><Button onClick={() => { if (plan) { const fork = structuredClone(plan); setForkedPlan(fork); localStorage.setItem("eveplan_forked_plan", serializeStoredPlan(fork)); showToast("Plan fork created"); } }}><GitFork size={16} />Fork plan</Button><label className="flex min-h-11 items-center gap-2 px-3 text-sm"><input type="checkbox" checked={isElderMode} onChange={(event) => setIsElderMode(event.target.checked)} />Elder-friendly</label><Button onClick={() => setIsOnboardingOpen(true)}><PlusCircle size={16} />New plan</Button><Button onClick={() => void initializeDefaultPlan()}><RefreshCw size={16} />Reload plan</Button></div></details>
      </div>
      {plan && <div className="mx-auto max-w-[1500px] space-y-2 px-4 pb-3 lg:px-6">
        <div className="summary-grid rounded-2xl border border-line/70 bg-white/42 p-1"><Stat label="Attendees" value={formatNumber(plan.guest_count)} /><Stat label="Special diets" value={formatNumber(Object.values(plan.special_diets).reduce((total, count) => total + count, 0))} detail="Guest counts entered" /><Stat label="Days to go" value={formatNumber(plan.days_until_event)} /><Stat label="Total budget" value={formatCompactMoney(plan.total_budget_cap_inr)} /><Stat label="Contingency" value={formatCompactMoney(contingency)} /></div>
        <form onSubmit={handleNaturalLanguageSubmit} className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="global-command">Describe a change</label><input id="global-command" className="field-control flex-1" value={naturalLanguageInput} onChange={(event) => setNaturalLanguageInput(event.target.value)} placeholder="Describe a change to your plan…" /><Button variant="primary" type="submit" disabled={!naturalLanguageInput.trim() || isLoading}>{isLoading ? "Updating" : "Describe a change"}</Button></form>
        {streamedRationale && <p aria-live="polite" aria-atomic="true" className="text-sm text-muted">{streamedRationale}</p>}
      </div>}
    </header>
    <main className="app-main">
      {isDegraded && !plan && <Banner tone="warning" role="alert" className="mb-5">{statusMessage} <Button variant="quiet" onClick={() => void initializeDefaultPlan()}>Retry</Button></Banner>}
      {isDegraded && plan && <Banner tone="warning" role={statusMessage ? "alert" : "status"} className="mb-5 flex flex-wrap items-center justify-between gap-3"><span>{statusMessage || "Some online services are unavailable. Your plan is using its offline fallback."}</span>{statusMessage && <Button variant="quiet" disabled={isLoading} onClick={() => retryScenario ? void handleTriggerScenario(retryScenario) : void handleNaturalLanguageSubmit()}>{isLoading ? "Retrying…" : "Try again"}</Button>}</Banner>}
      {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} tabIndex={0} hidden={activeTab !== tab.id}>
        {activeTab === tab.id && plan && props ? <Suspense fallback={<GlassPanel className="space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-48 w-full" /></GlassPanel>}>
          <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32, bounce: 0 }}>{React.createElement(panels[activeTab], props)}</motion.div>
        </Suspense> : activeTab === tab.id && isLoading ? <GlassPanel className="space-y-4"><Skeleton className="h-7 w-1/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></GlassPanel> : activeTab === tab.id ? <GlassPanel className="text-center"><h1 className="text-2xl">Your plan is not available yet</h1><p className="my-3 text-muted">Retry the connection or start a new celebration plan.</p><div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={() => void initializeDefaultPlan()}>Retry connection</Button><Button onClick={() => setIsOnboardingOpen(true)}>Start a new plan</Button></div></GlassPanel> : null}
      </div>)}
    </main>
    <VendorQuoteModal isOpen={isVendorModalOpen} onClose={() => setIsVendorModalOpen(false)} allocatedCateringBudgetMaxInr={cateringBudget} guestCount={plan?.guest_count ?? 0} />
    <OnboardingWizard isOpen={isOnboardingOpen} onClose={() => setIsOnboardingOpen(false)} onPlanCreated={(newPlan) => { updatePlanWithHistory(newPlan); setIsDegraded(false); showToast("Plan created"); }} />
    <Toast message={toast} />
  </div>;
};

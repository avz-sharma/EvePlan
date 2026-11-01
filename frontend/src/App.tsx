import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, GitFork, Redo2, Undo2, Menu, PlusCircle, RefreshCw } from "lucide-react";
import type { PlanDelta } from "./api/types";
import { apiUrl } from "./api/client";
import { streamReplan } from "./api/sseClient";
import { tabs, type TabId } from "./tabs.config";
import { Tabs } from "./components/ui/Tabs";
import { Banner, Button, GlassPanel, IconButton, Skeleton, Stat, Toast } from "./components/ui";
import { LazyQuoteModal as VendorQuoteModal, LazyWizard as OnboardingWizard } from "./components/LazyDialogs";
import { planActions, usePlanStore } from "./state/planStore";
import { useRequestController } from "./lib/useRequestController";
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
} satisfies Record<TabId, React.LazyExoticComponent<React.ComponentType>>;

const ActivePanel = React.memo(({ tab }: { tab: TabId }) => React.createElement(panels[tab]));

const selectedTab = (): TabId => {
  const id = window.location.hash.replace(/^#\/?/, "").split("?")[0] as TabId;
  return tabs.some((tab) => tab.id === id) ? id : "overview";
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(selectedTab);
  const [isElderMode, setIsElderMode] = useState(false);
  const plan = usePlanStore(state => state.plan);
  const historyIndex = usePlanStore(state => state.historyIndex);
  const historyLength = usePlanStore(state => state.history.length);
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [isDegraded, setIsDegraded] = useState(false);
  const isLoading = usePlanStore(state => state.isLoading);
  const setIsLoading = (value: boolean) => planActions.patch({ isLoading: value });
  const [statusMessage, setStatusMessage] = useState("");
  const [streamedRationale, setStreamedRationale] = useState("");
  const [retryScenario, setRetryScenario] = useState<{ delta: PlanDelta; label: string } | null>(null);
  const toast = usePlanStore(state => state.toast);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const isVendorModalOpen = usePlanStore(state => state.quotesOpen);
  const reducedMotion = useReducedMotion();
  const { begin: beginRequest, cancel: cancelRequest } = useRequestController();

  useEffect(() => { document.documentElement.classList.toggle("elder-friendly-mode", isElderMode); }, [isElderMode]);
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/overview");
    const sync = () => setActiveTab(selectedTab()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, []);
  const selectTab = (id: string) => { const next = id as TabId; setActiveTab(next); window.location.hash = `/${next}`; };
  const showToast = planActions.notify;
  const updatePlanWithHistory = planActions.update;
  const initializeDefaultPlan = useCallback(async () => {
    setIsLoading(true); setIsDegraded(false); setStatusMessage("");
    try { if (!planActions.restore()) setIsOnboardingOpen(true); }
    catch (error) { setIsDegraded(true); setStatusMessage(error instanceof Error ? error.message : "Plan could not be loaded. Please retry."); }
    finally { planActions.patch({ isLoading: false }); }
  }, []);
  useLayoutEffect(() => { void initializeDefaultPlan(); }, [initializeDefaultPlan]);
  const handleUndo = planActions.undo;
  const handleRedo = planActions.redo;

  const handleNaturalLanguageSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!plan || !naturalLanguageInput.trim() || isLoading) return;
    const prompt = naturalLanguageInput.trim(); setNaturalLanguageInput(""); setRetryScenario(null); setStreamedRationale(""); setIsLoading(true); setIsDegraded(false); setStatusMessage("");
    await streamReplan(plan, prompt, {
      onDelta: ({ delta, degraded_mode }) => { planActions.patch({ lastDelta: delta }); setIsDegraded(degraded_mode); setStatusMessage(degraded_mode ? "An offline fallback was used to interpret this change." : ""); },
      onEngineDiff: ({ updated_plan, diff, tradeoff_options }) => { updatePlanWithHistory(updated_plan, { lastDiff: diff, tradeoffOptions: tradeoff_options }); },
      onRationale: ({ rationale }) => { setStreamedRationale(rationale); setIsLoading(false); },
      onError: (error) => { setNaturalLanguageInput(prompt); setIsLoading(false); setIsDegraded(true); setStatusMessage(error.message || "We could not apply that change."); },
      onComplete: () => setIsLoading(false),
    }, beginRequest());
  };

  const handleTriggerScenario = async (scenario: { delta: PlanDelta; label: string }) => {
    if (!plan || isLoading) return; setRetryScenario(null); setIsDegraded(false); setStatusMessage(""); setIsLoading(true);
    try {
      const response = await fetch(apiUrl("/api/plan/replan"), { method: "POST", signal: beginRequest(), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, delta: scenario.delta }) });
      if (!response.ok) throw new Error();
      const result = await response.json(); updatePlanWithHistory(result.updated_plan, { lastDelta: scenario.delta, lastDiff: result.diff, tradeoffOptions: result.tradeoff_options || [] }); setStatusMessage("");
    } catch { setRetryScenario(scenario); setIsDegraded(true); setStatusMessage("We could not apply that change."); }
    finally { setIsLoading(false); }
  };

  const contingency = useMemo(() => plan?.budget_buckets.reduce((sum, bucket) => sum + bucket.contingency_inr, 0) ?? 0, [plan]);
  const cateringBudget = plan?.budget_buckets.find((bucket) => bucket.category.includes("Catering"))?.allocated_max_inr ?? null;
  return <div className="app-shell relative">
    <div className="app-backdrop" aria-hidden="true" />
    <header className="app-header glass-panel border-x-0 border-t-0 rounded-none">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-[160px] items-center gap-3"><img src="/eveplan-logo.png" alt="" aria-hidden="true" width="56" height="56" className="size-14 rounded-xl bg-white/80 object-contain p-1" /><div><div className="font-semibold text-accent">EvePlan</div><div className="max-w-52 truncate text-xs text-muted">{plan?.title ?? "Celebration planner"}</div></div></div>
        <nav className="order-3 w-full min-w-0 lg:order-2 lg:w-auto"><Tabs tabs={[...tabs]} value={activeTab} onChange={selectTab} /></nav>
        <div className="hidden items-center gap-2 lg:order-3 lg:flex">
          <IconButton label="Undo" onClick={handleUndo} disabled={historyIndex <= 0}><Undo2 size={18} /></IconButton><IconButton label="Redo" onClick={handleRedo} disabled={historyIndex >= historyLength - 1}><Redo2 size={18} /></IconButton>
          <IconButton label="Fork current plan" onClick={() => { planActions.fork(); }} disabled={!plan}><GitFork size={18} /></IconButton>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line/70 bg-white/45 px-3 text-sm"><Eye size={16} /><span>Elder-friendly</span><input type="checkbox" checked={isElderMode} onChange={(event) => setIsElderMode(event.target.checked)} /></label>
          <Button variant="quiet" onClick={() => setIsOnboardingOpen(true)} aria-label="Start a new plan"><PlusCircle size={17} />New plan</Button>
          <IconButton label="Reload plan" onClick={() => void initializeDefaultPlan()}><RefreshCw size={17} /></IconButton>
        </div>
        <details className="relative lg:hidden"><summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line bg-white/70" aria-label="More plan actions"><Menu size={18} /></summary><div className="absolute right-0 top-12 z-40 grid min-w-52 gap-2 rounded-2xl border border-line bg-white p-3 shadow-lg"><Button onClick={handleUndo} disabled={historyIndex <= 0}><Undo2 size={16} />Undo</Button><Button onClick={handleRedo} disabled={historyIndex >= historyLength - 1}><Redo2 size={16} />Redo</Button><Button onClick={() => { planActions.fork(); }}><GitFork size={16} />Fork plan</Button><label className="flex min-h-11 items-center gap-2 px-3 text-sm"><input type="checkbox" checked={isElderMode} onChange={(event) => setIsElderMode(event.target.checked)} />Elder-friendly</label><Button onClick={() => setIsOnboardingOpen(true)}><PlusCircle size={16} />New plan</Button><Button onClick={() => void initializeDefaultPlan()}><RefreshCw size={16} />Reload plan</Button></div></details>
      </div>
      {plan && <div className="mx-auto max-w-[1500px] space-y-2 px-4 pb-3 lg:px-6">
        <div className="summary-grid rounded-2xl border border-line/70 bg-white/42 p-1"><Stat label="Attendees" value={formatNumber(plan.guest_count)} /><Stat label="Special diets" value={formatNumber(Object.values(plan.special_diets).reduce((total, count) => total + count, 0))} detail="Guest counts entered" /><Stat label="Days to go" value={formatNumber(plan.days_until_event)} /><Stat label="Total budget" value={formatCompactMoney(plan.total_budget_cap_inr)} /><Stat label="Contingency" value={formatCompactMoney(contingency)} /></div>
        <form onSubmit={handleNaturalLanguageSubmit} className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="global-command">Describe a change</label><input id="global-command" className="field-control flex-1" value={naturalLanguageInput} maxLength={500} onChange={(event) => { cancelRequest(); setIsLoading(false); setNaturalLanguageInput(event.target.value); }} placeholder="Describe a change to your plan…" /><Button variant="primary" type="submit" disabled={!naturalLanguageInput.trim() || isLoading}>{isLoading ? "Updating" : "Describe a change"}</Button></form>
        {streamedRationale && <p aria-live="polite" aria-atomic="true" className="text-sm text-muted">{streamedRationale}</p>}
      </div>}
    </header>
    <main className="app-main">
      {isDegraded && !plan && <Banner tone="warning" role="alert" className="mb-5">{statusMessage} <Button variant="quiet" onClick={() => void initializeDefaultPlan()}>Retry</Button></Banner>}
      {isDegraded && plan && <Banner tone="warning" role={statusMessage ? "alert" : "status"} className="mb-5 flex flex-wrap items-center justify-between gap-3"><span>{statusMessage || "Some online services are unavailable. Your plan is using its offline fallback."}</span>{statusMessage && <Button variant="quiet" disabled={isLoading} onClick={() => retryScenario ? void handleTriggerScenario(retryScenario) : void handleNaturalLanguageSubmit()}>{isLoading ? "Retrying…" : "Try again"}</Button>}</Banner>}
      {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} tabIndex={0} hidden={activeTab !== tab.id}>
        {activeTab === tab.id && plan ? <Suspense fallback={<GlassPanel className="space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-48 w-full" /></GlassPanel>}>
          <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32, bounce: 0 }}><ActivePanel tab={activeTab} /></motion.div>
        </Suspense> : activeTab === tab.id && isLoading ? <GlassPanel className="space-y-4"><Skeleton className="h-7 w-1/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></GlassPanel> : activeTab === tab.id ? <GlassPanel className="text-center"><h1 className="text-2xl">Your plan is not available yet</h1><p className="my-3 text-muted">Retry the connection or start a new celebration plan.</p><div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={() => void initializeDefaultPlan()}>Retry connection</Button><Button onClick={() => setIsOnboardingOpen(true)}>Start a new plan</Button></div></GlassPanel> : null}
      </div>)}
    </main>
    <VendorQuoteModal isOpen={isVendorModalOpen} onClose={() => planActions.patch({ quotesOpen: false })} allocatedCateringBudgetMaxInr={cateringBudget} guestCount={plan?.guest_count ?? 0} />
    <OnboardingWizard isOpen={isOnboardingOpen} onClose={() => setIsOnboardingOpen(false)} onPlanCreated={(newPlan) => { updatePlanWithHistory(newPlan); setIsDegraded(false); showToast("Plan created"); }} />
    <Toast message={toast} />
  </div>;
};

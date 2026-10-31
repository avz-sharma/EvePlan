import React from "react";
import { planActions, useCurrentPlan, usePlanStore } from "../state/planStore";
import { ScenarioBranchCompare } from "../components/ScenarioBranchCompare";
import { GlassPanel } from "../components/ui";

export const ScenariosTab: React.FC = () => {
  const plan = useCurrentPlan();
  const forkedPlan = usePlanStore(state => state.forkedPlan);
  const history = usePlanStore(state => state.history);
  const historyIndex = usePlanStore(state => state.historyIndex);
  return <div className="space-y-6">
  <GlassPanel><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Compare options</p><h1 className="mt-1 text-2xl">Scenarios and history</h1><p className="mt-1 text-sm text-muted">Keep a second plan while you explore changes. Undo and redo move through saved plan states.</p></div>
    <ScenarioBranchCompare currentPlan={plan} forkedPlan={forkedPlan} onForkPlan={planActions.fork} onSwitchToFork={planActions.switchFork} onClearFork={planActions.clearFork} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} onUndo={planActions.undo} onRedo={planActions.redo} />
  </GlassPanel>
  <GlassPanel><h2 className="mb-3 text-xl">Plan history</h2><ol className="space-y-2">{history.map((item, index) => <li key={`${index}-${item.title}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${index === historyIndex ? "border-accent/40 bg-accent/5" : "border-line/70 bg-white/40"}`}><span>{index === 0 ? "Starting plan" : `Plan update ${index}`}</span><span className="text-muted">{item.guest_count} attendees · {item.days_until_event} days to go {index === historyIndex ? "· Current" : ""}</span></li>)}</ol></GlassPanel>
</div>;
};

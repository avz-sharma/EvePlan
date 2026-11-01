import React from "react";
import { usePlanStore } from "../state/planStore";
import { AuditDeltaDrawer } from "../components/AuditDeltaDrawer";
import { GlassPanel } from "../components/ui";

/** Explain planning inputs, derived outputs and optional provider behavior. */
export const HowItWorksTab: React.FC = () => {
  const lastDelta = usePlanStore(state => state.lastDelta);
  const lastDiff = usePlanStore(state => state.lastDiff);
  return <div className="space-y-6">
  <GlassPanel><p className="text-xs font-semibold uppercase tracking-wider text-accent">A clear, predictable workflow</p><h1 className="mt-1 text-2xl">How EvePlan works</h1><p className="mt-3 max-w-3xl text-muted">A language model can help interpret a request. The planning engine checks the resulting change against the event plan, updates dependent tasks, and calculates budget ranges. You can review the request and the resulting plan changes below.</p></GlassPanel>
  <GlassPanel><h2 className="mb-3 text-xl">What happens to a change?</h2><ol className="grid gap-3 md:grid-cols-3">{[["1", "Describe", "Write a change in everyday language or choose a saved scenario."], ["2", "Review", "The app turns the request into structured plan updates."], ["3", "Recalculate", "The planning engine updates costs, tasks, and dependencies deterministically."]].map(([step, title, text]) => <li key={step} className="rounded-xl border border-line/70 bg-white/40 p-4"><span className="text-sm font-bold text-accent">{step}</span><h3 className="mt-2 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></li>)}</ol></GlassPanel>
  <AuditDeltaDrawer lastDelta={lastDelta} lastDiff={lastDiff} />
</div>;
};

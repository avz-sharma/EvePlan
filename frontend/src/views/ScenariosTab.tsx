import React from "react";
import type { PlanViewProps } from "./types";
import { ScenarioBranchCompare } from "../components/ScenarioBranchCompare";
import { GlassPanel } from "../components/ui";

export const ScenariosTab: React.FC<PlanViewProps> = (props) => <div className="space-y-6">
  <GlassPanel><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Compare options</p><h1 className="mt-1 text-2xl">Scenarios and history</h1><p className="mt-1 text-sm text-muted">Keep a second plan while you explore changes. Undo and redo move through saved plan states.</p></div>
    <ScenarioBranchCompare currentPlan={props.plan} forkedPlan={props.forkedPlan} onForkPlan={props.onFork} onSwitchToFork={props.onSwitchFork} onClearFork={props.onClearFork} canUndo={props.canUndo} canRedo={props.canRedo} onUndo={props.onUndo} onRedo={props.onRedo} />
  </GlassPanel>
  <GlassPanel><h2 className="mb-3 text-xl">Plan history</h2><ol className="space-y-2">{props.history.map((item, index) => <li key={`${index}-${item.title}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${index === props.historyIndex ? "border-accent/40 bg-accent/5" : "border-line/70 bg-white/40"}`}><span>{index === 0 ? "Starting plan" : `Plan update ${index}`}</span><span className="text-muted">{item.guest_count} attendees · {item.days_until_event} days to go {index === props.historyIndex ? "· Current" : ""}</span></li>)}</ol></GlassPanel>
</div>;

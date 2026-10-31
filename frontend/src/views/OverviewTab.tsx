import React from "react";
import { CalendarDays, Users } from "lucide-react";
import type { PlanViewProps } from "./types";
import { Chip, GlassPanel, Stat } from "../components/ui";
import { QuickScenarioChips } from "../components/QuickScenarioChips";
import { formatCompactMoney } from "../lib/format";

export const OverviewTab: React.FC<PlanViewProps> = ({ plan, onPlanUpdated, isLoading }) => {
  const tasks = [...plan.tasks].filter((task) => task.is_critical).sort((a, b) => a.earliest_start - b.earliest_start).slice(0, 3);
  const projected = plan.budget_buckets.reduce((total, bucket) => total + bucket.allocated_max_inr + bucket.contingency_inr, 0);
  return <div className="space-y-6">
    <GlassPanel className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <div><Chip tone="gold">Your celebration plan</Chip><h1 className="mt-3 text-3xl md:text-4xl">{plan.title}</h1><p className="mt-3 max-w-2xl text-muted">A clear view of the decisions, dates, and people that need your attention.</p></div>
      <div className="grid grid-cols-2 gap-3"><Stat label="Attendees" value={<><Users className="mr-1 inline size-4" />{plan.guest_count}</>} /><Stat label="Days to go" value={<><CalendarDays className="mr-1 inline size-4" />{plan.days_until_event}</>} /><Stat label="Projected spend" value={formatCompactMoney(projected)} /></div>
    </GlassPanel>
    <GlassPanel><QuickScenarioChips plan={plan} onApplyFixture={(updated, diff) => onPlanUpdated(updated, diff)} isLoading={isLoading} /></GlassPanel>
    <GlassPanel><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Coming up</p><h2 className="mt-1 text-xl font-semibold">Critical tasks</h2></div><span className="text-sm text-muted">Top 3 by date</span></div>
      {tasks.length ? <ol className="grid gap-3 md:grid-cols-3">{tasks.map((task) => <li key={task.id} className="rounded-xl border border-line/70 bg-white/45 p-4"><div className="flex justify-between gap-3"><span className="font-semibold">{task.title}</span><Chip tone="warning">Critical</Chip></div><p className="mt-2 text-sm text-muted">{task.event_name || "Event"} · due {task.due_date || "date not set"} · {task.duration_days} days</p></li>)}</ol> : <p className="text-sm text-muted">No time-critical tasks right now.</p>}
    </GlassPanel>
  </div>;
};

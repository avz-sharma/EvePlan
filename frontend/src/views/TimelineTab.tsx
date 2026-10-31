import React, { useState } from "react";
import { CascadeGraphView } from "../components/CascadeGraphView";
import { TimelineChecklist } from "../components/TimelineChecklist";
import { Button, GlassPanel } from "../components/ui";
import type { TimelineProps } from "./types";

export const TimelineTab: React.FC<TimelineProps> = ({ plan, lastDiff }) => {
  const [view, setView] = useState<"map" | "checklist">("map");
  return <GlassPanel className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Dates and dependencies</p><h1 className="mt-1 text-2xl">Event timeline</h1><p className="mt-1 text-sm text-muted">See which tasks depend on each other and what needs attention first.</p></div>
      <div className="flex gap-2"><Button variant={view === "map" ? "primary" : "secondary"} onClick={() => setView("map")}>Timeline map</Button><Button variant={view === "checklist" ? "primary" : "secondary"} onClick={() => setView("checklist")}>Critical path list</Button></div>
    </header>
    {view === "map" ? <CascadeGraphView tasks={plan.tasks} affectedTaskIds={lastDiff?.affected_task_ids || []} mutatedAttribute={lastDiff?.mutated_attribute} /> : <TimelineChecklist tasks={plan.tasks} />}
  </GlassPanel>;
};

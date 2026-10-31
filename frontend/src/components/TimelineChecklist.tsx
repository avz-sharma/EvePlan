import React from "react";
import { AlertCircle, Clock } from "lucide-react";
import type { TaskNode } from "../api/types";
import { GlassPanel } from "./ui";

interface Props { tasks: TaskNode[] }

export const TimelineChecklist: React.FC<Props> = ({ tasks }) => <GlassPanel className="space-y-4">
  <div><h2 className="text-xl">Task schedule</h2><p className="mt-1 text-sm text-muted">Dates are counted back from each event. Prerequisites connect work across days.</p></div>
  {!tasks.length ? <p className="text-sm text-muted">Tasks will appear here when your plan includes events.</p> : <ol className="space-y-2">{tasks.map((task, index) => <li key={task.id} className={`rounded-xl border p-3 ${task.is_critical ? "border-danger/30 bg-danger/5" : "border-line/70 bg-white/50"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{index + 1}.</span><h3 className="font-semibold">{task.title}</h3>{task.is_critical && <span className="rounded-full bg-danger-soft px-2 py-1 text-xs text-danger">Critical</span>}{task.hop_level > 0 && <span className="rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">Updated</span>}</div><p className="mt-1 text-sm text-muted">{task.event_name || "Plan task"} · {task.budget_category || task.category}{task.due_date ? ` · due ${task.due_date}` : ""}</p>{task.dependencies.length > 0 && <p className="mt-1 text-xs text-muted">After: {task.dependencies.join(", ")}</p>}</div>
      <div className="flex shrink-0 items-center gap-3 text-sm"><span className="flex items-center gap-1 text-muted"><Clock size={14} />{task.duration_days} days</span>{task.is_critical ? <span className="flex items-center gap-1 text-danger"><AlertCircle size={14} />No float</span> : <span className="text-muted">{task.slack_days} days float</span>}<span className="rounded-full bg-white/70 px-2 py-1 text-xs">{task.status.replace("_", " ").toLowerCase()}</span></div>
    </div>
  </li>)}</ol>}
</GlassPanel>;

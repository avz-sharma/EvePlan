import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Clock } from "lucide-react";
import type { TaskNode } from "../api/types";
import { layoutDag } from "./layoutDag";

interface Props { tasks: TaskNode[]; affectedTaskIds?: string[]; mutatedAttribute?: string | null }

export const CascadeGraphView: React.FC<Props> = ({ tasks, affectedTaskIds = [], mutatedAttribute }) => {
  const layout = useMemo(() => layoutDag(tasks), [tasks]);
  const reduceMotion = useReducedMotion();
  if (!tasks.length) return <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Tasks will appear here when a plan is available.</p>;

  return <div className="space-y-3">
    <h2 className="sr-only">Task dependency map</h2>
    {mutatedAttribute && <p className="text-sm text-accent">Updated: {mutatedAttribute}</p>}
    <div className="w-full overflow-hidden rounded-2xl border border-line/70 bg-white/45 p-2">
      <svg role="img" aria-labelledby="timeline-title timeline-desc" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMinYMin meet" className="block h-auto w-full max-w-full">
        <title id="timeline-title">Task dependencies</title><desc id="timeline-desc">Tasks are arranged in columns by dependency order. Critical tasks are marked.</desc>
        <defs><marker id="task-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--muted))" /></marker><marker id="task-arrow-affected" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--accent))" /></marker></defs>
        {layout.edges.map((edge) => {
          const x1 = edge.from.x + edge.from.width; const x2 = edge.to.x; const y1 = edge.from.y + edge.from.height / 2; const y2 = edge.to.y + edge.to.height / 2; const mid = (x1 + x2) / 2;
          const affected = affectedTaskIds.includes(edge.to.task.id) || affectedTaskIds.includes(edge.from.task.id);
          const path = edge.to.level - edge.from.level > 1
            ? `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x1 + 24} ${layout.height - 16}, ${x1 + 36} ${layout.height - 16} L ${x2 - 36} ${layout.height - 16} C ${x2 - 24} ${layout.height - 16}, ${x2 - 24} ${y2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
          return <motion.path key={edge.id} d={path} fill="none" stroke={affected ? "rgb(var(--accent))" : "rgb(var(--muted) / .7)"} strokeWidth={affected ? 3 : 1.5} markerEnd={affected ? "url(#task-arrow-affected)" : "url(#task-arrow)"} initial={{ opacity: .35 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { duration: .24, delay: (edge.to.task.hop_level ?? 0) * .08 }} />;
        })}
        {layout.nodes.map((node) => {
          const { task } = node; const affected = affectedTaskIds.includes(task.id);
          return <foreignObject key={task.id} x={node.x} y={node.y} width={node.width} height={node.height}>
            <motion.div tabIndex={0} aria-label={`${task.title}, ${task.is_critical ? "critical task" : `${task.slack_days} days float`}`} title={task.title} initial={{ opacity: .5 }} animate={{ opacity: 1 }} transition={reduceMotion ? { duration: 0 } : { duration: .24, delay: (task.hop_level ?? 0) * .08 }} className={`flex h-full flex-col justify-between rounded-xl border p-3 text-xs shadow-sm ${affected ? "border-accent bg-accent/10" : task.is_critical ? "border-danger/40 bg-danger/5" : "border-line bg-white/90"}`}>
              <div><div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-muted"><span>{task.event_name || "Plan task"}</span>{affected && <span className="text-accent">Updated</span>}</div><h3 className="line-clamp-3 font-semibold leading-snug text-ink">{task.title}</h3><p className="mt-1 text-muted">{task.due_date ? `Due ${task.due_date}` : `Day ${task.earliest_start}`} · {task.duration_days} days</p></div>
              <div className="flex items-center justify-between border-t border-line/70 pt-1.5 text-[11px]">{task.is_critical ? <span className="flex items-center gap-1 text-danger"><AlertCircle size={12} />Critical</span> : <span className="flex items-center gap-1 text-muted"><Clock size={12} />{task.slack_days}d float</span>}<span className="truncate text-muted">{task.category}</span></div>
            </motion.div>
          </foreignObject>;
        })}
      </svg>
    </div>
    <p className="text-xs text-muted">Read left to right: each line connects a task to the work that depends on it.</p>
  </div>;
};

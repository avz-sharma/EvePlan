import React from "react";
import { ArrowRightLeft, GitFork, Redo2, Undo2 } from "lucide-react";
import type { EventPlan } from "../api/types";
import { formatMoney } from "../lib/format";
import { Button, Chip, GlassPanel } from "./ui";

interface Props {
  currentPlan: EventPlan;
  forkedPlan: EventPlan | null;
  onForkPlan: () => void;
  onSwitchToFork: () => void;
  onClearFork: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const projected = (plan: EventPlan) => plan.budget_buckets.reduce((total, bucket) => total + bucket.allocated_max_inr + bucket.contingency_inr, 0);
const venueFit = (plan: EventPlan) => plan.vendor_assignments.filter((vendor) => vendor.category === "venue" && vendor.capacity !== null).map((vendor) => {
  const event = plan.days.flatMap((day) => day.events).find((item) => item.id === vendor.event_id);
  return `${event?.custom_name || event?.catalog_id || "Event"}: ${event?.guest_count ?? plan.guest_count}/${vendor.capacity}`;
});

/** Compare the active plan with its independent fork. */
export const ScenarioBranchCompare: React.FC<Props> = ({ currentPlan, forkedPlan, onForkPlan, onSwitchToFork, onClearFork, canUndo, canRedo, onUndo, onRedo }) => {
  const planCard = (plan: EventPlan, label: string, color: "accent" | "gold") => <section className="rounded-2xl border border-line/70 bg-white/50 p-4" aria-label={label}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{label}</h3><Chip tone={color === "gold" ? "gold" : "success"}>{plan.days.length} days</Chip></div>
    <p className="mt-3 text-2xl font-semibold">{formatMoney(projected(plan))}</p><p className="text-sm text-muted">Projected from entered budgets and quotes</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt className="text-muted">Guests</dt><dd className="text-right">{plan.guest_count}</dd><dt className="text-muted">First event</dt><dd className="text-right">{plan.first_event_date || "Not set"}</dd><dt className="text-muted">Venue fit</dt><dd className="col-span-2 text-right">{venueFit(plan).join(" · ") || "No vendor capacity entered"}</dd></dl>
  </section>;

  return <GlassPanel className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">Plan branches</h2><p className="text-sm text-muted">Keep a second plan to compare vendor choices and event changes.</p></div><div className="flex gap-2"><Button onClick={onUndo} disabled={!canUndo}><Undo2 size={16} />Undo</Button><Button onClick={onRedo} disabled={!canRedo}><Redo2 size={16} />Redo</Button>{!forkedPlan ? <Button variant="primary" onClick={onForkPlan}><GitFork size={16} />Create Plan B</Button> : <><Button onClick={onSwitchToFork}><ArrowRightLeft size={16} />Switch branches</Button><Button onClick={onClearFork}>Remove Plan B</Button></>}</div></header>
    <div className={`grid gap-3 ${forkedPlan ? "md:grid-cols-2" : "md:grid-cols-1"}`}>{planCard(currentPlan, "Plan A", "accent")}{forkedPlan && planCard(forkedPlan, "Plan B", "gold")}</div>
  </GlassPanel>;
};

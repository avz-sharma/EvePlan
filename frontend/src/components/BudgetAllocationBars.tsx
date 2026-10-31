import React from "react";
import { AlertTriangle, Tag } from "lucide-react";
import type { BudgetBucket } from "../api/types";
import { Chip, GlassPanel } from "./ui";
import { formatMoney, formatCompactMoney } from "../lib/format";

interface BudgetAllocationBarsProps {
  buckets: BudgetBucket[];
  totalBudgetCapInr: number;
  previewAdjustments?: Record<string, number> | null;
}

export const BudgetAllocationBars: React.FC<BudgetAllocationBarsProps> = ({ buckets, totalBudgetCapInr, previewAdjustments }) => {
  const cap = Math.max(totalBudgetCapInr, 1);
  const percent = (amount: number) => Math.max(0, Math.min(100, amount / cap * 100));
  const rows = buckets.map((bucket) => {
    const adjust = previewAdjustments?.[bucket.category] ?? 0;
    const min = Math.max(0, bucket.allocated_min_inr);
    const max = Math.max(0, bucket.allocated_max_inr + adjust);
    const unestimated = max === 0 && bucket.assumptions.some((item) => item.toLowerCase().includes("not estimated"));
    return { bucket, min, max, unestimated, buffer: Math.max(0, bucket.contingency_inr + (previewAdjustments?.["Contingency Reserve"] ?? 0)) };
  });

  return <GlassPanel aria-labelledby="budget-heading" className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/70 pb-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-accent">Planning estimates</p><h2 id="budget-heading" className="mt-1 text-2xl font-semibold">Budget by category</h2><p className="mt-1 text-sm text-muted">These are planning heuristics, not market rates. Compare each range with the total budget.</p></div>
      <Chip tone="gold">Budget {formatCompactMoney(totalBudgetCapInr)}</Chip>
    </header>
    <div className="space-y-6">
      {rows.map(({ bucket, min, max, buffer, unestimated }) => <div key={bucket.category} className="grid gap-2 md:grid-cols-[minmax(150px,1fr)_minmax(180px,2fr)_minmax(180px,1.2fr)] md:items-center">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{bucket.category}</span>{bucket.is_violated && <Chip tone="danger"><AlertTriangle size={14} /> High spend</Chip>}</div>
        <div role="img" aria-label={unestimated ? `${bucket.category}: not estimated` : `${bucket.category}: ${formatMoney(min)} to ${formatMoney(max)}, contingency ${formatMoney(buffer)}${bucket.category_budget_cap_inr === null || bucket.category_budget_cap_inr === undefined ? "" : `, category budget ${formatMoney(bucket.category_budget_cap_inr)}`}`} className="relative h-5 overflow-hidden rounded-full border border-line/80 bg-ink/5">
          <div className="absolute inset-y-0 left-0 origin-left scale-x-100 bg-accent" style={{ width: "100%", transform: `scaleX(${percent(min) / 100})` }} />
          <div className="absolute inset-y-0 origin-left bg-accent/25" style={{ left: `${percent(min)}%`, width: "100%", transform: `scaleX(${percent(Math.max(0, max - min)) / 100})` }} />
          <div className="absolute inset-y-0 origin-left bg-success/80" style={{ left: `${percent(max)}%`, width: "100%", transform: `scaleX(${percent(buffer) / 100})` }} />
        </div>
        <div className="money text-sm text-muted">{unestimated ? <span>Not estimated</span> : <>{formatCompactMoney(min)} – {formatCompactMoney(max)} <span className="text-success">+ {formatCompactMoney(buffer)}</span></>}{bucket.category_budget_cap_inr !== null && bucket.category_budget_cap_inr !== undefined && <span className="ml-2 block text-xs text-muted">Category budget {formatCompactMoney(bucket.category_budget_cap_inr)}</span>}</div>
        {bucket.assumptions?.length ? <div className="flex flex-wrap gap-2 md:col-start-2 md:col-span-2">{bucket.assumptions.map((assumption, index) => <Chip key={`${bucket.category}-${index}`} tone="gold" className="font-normal"><Tag size={12} />{assumption}</Chip>)}</div> : null}
      </div>)}
    </div>
    <table className="sr-only-table"><caption>Budget ranges and contingency by category</caption><thead><tr><th>Category</th><th>Minimum</th><th>Maximum</th><th>Contingency</th><th>Category budget</th></tr></thead><tbody>{rows.map(({ bucket, min, max, buffer, unestimated }) => <tr key={bucket.category}><th>{bucket.category}</th><td>{unestimated ? "Not estimated" : formatMoney(min)}</td><td>{unestimated ? "Not estimated" : formatMoney(max)}</td><td>{unestimated ? "Not estimated" : formatMoney(buffer)}</td><td>{bucket.category_budget_cap_inr == null ? "Not set" : formatMoney(bucket.category_budget_cap_inr)}</td></tr>)}</tbody></table>
  </GlassPanel>;
};

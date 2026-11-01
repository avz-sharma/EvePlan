import { BudgetProgress } from "../components/BudgetProgress";
import React, { useState } from "react";
import { formatMoney } from "../lib/format";
import { Button } from "../components/ui";
import { useCurrentPlan, usePlanStore, planActions } from "../state/planStore";
import { BudgetAllocationBars } from "../components/BudgetAllocationBars";
import { TradeOffCards } from "../components/TradeOffCards";
import { EmptyState } from "../components/ui";

export const BudgetTab: React.FC = () => {
  const plan = useCurrentPlan();
  const [percent, setPercent] = useState(String(plan.contingency_percent ?? 10));
  const [status, setStatus] = useState("");
  const tradeoffOptions = usePlanStore(state => state.tradeoffOptions);
  const previewAdjustments = usePlanStore(state => state.previewAdjustments);
  const onPreview = planActions.preview;
  const onApplyTradeOff = planActions.applyTradeOff;

  const projected = plan.budget_buckets.reduce((sum, bucket) => sum + bucket.allocated_max_inr + bucket.contingency_inr, 0);
  const overBudget = projected > plan.total_budget_cap_inr;
  return <div className="space-y-6">
    <BudgetProgress used={projected} total={plan.total_budget_cap_inr} />
    <p className="text-sm text-muted">Allocated percentage = category maximums plus contingency, divided by your upper budget limit ({formatMoney(plan.total_budget_cap_inr)}), × 100. Catering uses attendance across all events × your per-plate range, with entered catering quotes replacing the estimate for those events. Categories without quotes contribute ₹0, so the remaining amount still needs to cover those costs.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void planActions.mutateQuote("contingency", { contingency_percent: Number(percent) }).then(() => setStatus("Reserve updated.")).catch(() => setStatus("Reserve could not be updated.")); }}><label>Plan contingency (%)<input className="field-control" type="number" required min={0} max={100} step="0.1" value={percent} onChange={e => setPercent(e.target.value)} /></label><Button type="submit">Update reserve</Button><p role="status">{status}</p></form>
    <div className="grid gap-2 sm:grid-cols-2"><p>Selected saved quotation costs: {formatMoney((plan.saved_quotes ?? []).filter(q => q.selected).reduce((sum, q) => sum + (q.finalized_inr ?? 0), 0))}</p><p>Contingency reserve: {formatMoney(plan.budget_buckets.reduce((sum, b) => sum + b.contingency_inr, 0))}</p><p>Total provision (including other estimates): {formatMoney(projected)}</p><p>Remaining budget: {formatMoney(Math.max(0, plan.total_budget_cap_inr - projected))}</p><p>Additional budget needed: {formatMoney(Math.max(0, projected - plan.total_budget_cap_inr))}</p></div>
    <BudgetAllocationBars buckets={plan.budget_buckets} totalBudgetCapInr={plan.total_budget_cap_inr} previewAdjustments={previewAdjustments} />
    {overBudget && (tradeoffOptions.length ? <TradeOffCards options={tradeoffOptions} onHoverOption={onPreview} onApplyOption={onApplyTradeOff} /> : <EmptyState title="Plan is over the budget">Review category ranges or adjust the total budget to bring projected costs back in line.</EmptyState>)}
  </div>;
};

import React from "react";
import type { PlanViewProps } from "./types";
import { BudgetAllocationBars } from "../components/BudgetAllocationBars";
import { TradeOffCards } from "../components/TradeOffCards";
import { EmptyState } from "../components/ui";

export const BudgetTab: React.FC<PlanViewProps> = ({ plan, tradeoffOptions, previewAdjustments, onPreview, onApplyTradeOff }) => {
  const projected = plan.budget_buckets.reduce((sum, bucket) => sum + bucket.allocated_max_inr + bucket.contingency_inr, 0);
  const overBudget = projected > plan.total_budget_cap_inr;
  return <div className="space-y-6">
    <BudgetAllocationBars buckets={plan.budget_buckets} totalBudgetCapInr={plan.total_budget_cap_inr} previewAdjustments={previewAdjustments} />
    {overBudget && (tradeoffOptions.length ? <TradeOffCards options={tradeoffOptions} onHoverOption={onPreview} onApplyOption={onApplyTradeOff} /> : <EmptyState title="Plan is over the budget">Review category ranges or adjust the total budget to bring projected costs back in line.</EmptyState>)}
  </div>;
};

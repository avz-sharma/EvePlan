import React from "react";
import { FileUp, Info } from "lucide-react";
import { Button, EmptyState, GlassPanel } from "../components/ui";
import { planActions } from "../state/planStore";

export const QuotesTab: React.FC = () => {
  const onOpenQuotes = planActions.openQuotes;
  return <GlassPanel className="space-y-5">
  <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Vendor comparison</p><h1 className="mt-1 text-2xl">Quotes</h1><p className="mt-1 text-sm text-muted">Compare a vendor quote with the catering allowance in your plan.</p></div>
  <EmptyState title="No quotes compared yet">Add a quote to see a normalized per-person comparison and a checklist of included items.</EmptyState>
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-white/40 p-4"><p className="flex items-center gap-2 text-sm text-muted"><Info size={16} /> Estimates support planning and do not represent market prices.</p><Button variant="primary" onClick={onOpenQuotes}><FileUp size={16} /> Snap a quote</Button></div>
</GlassPanel>;
};

import React, { useState } from "react";
import type { NormalizedQuote, QuoteComparison } from "../api/types";
import { apiUrl } from "../api/client";
import { Dialog, Button } from "./ui";
import { QuoteResults } from "./QuoteResults";
import { X } from "lucide-react";

type Inclusion = "" | "included" | "excluded";
interface Props { isOpen: boolean; onClose: () => void; allocatedCateringBudgetMaxInr: number | null; guestCount: number }
const inclusionValue = (value: Inclusion): boolean | null => value === "" ? null : value === "included";

export const VendorQuoteModal: React.FC<Props> = ({ isOpen, onClose, allocatedCateringBudgetMaxInr, guestCount }) => {
  const [comparison, setComparison] = useState<QuoteComparison | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [quoteTotal, setQuoteTotal] = useState("");
  const [perAttendee, setPerAttendee] = useState("");
  const [manualBudgetCap, setManualBudgetCap] = useState("");
  const [taxes, setTaxes] = useState<Inclusion>("");
  const [backup, setBackup] = useState<Inclusion>("");
  const [jainMeals, setJainMeals] = useState<Inclusion>("");
  const [corkage, setCorkage] = useState<Inclusion>("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const effectiveBudgetCap = allocatedCateringBudgetMaxInr ?? (manualBudgetCap.trim() ? Number(manualBudgetCap) : null);
  if (!isOpen) return null;

  const compare = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendorName.trim() || Number(quoteTotal) < 0 || !quoteTotal || Number(perAttendee) < 0 || !perAttendee) {
      setError("Enter the vendor name, quote total, and per-attendee amount from the quote.");
      return;
    }
    const quote: NormalizedQuote = {
      vendor_name: vendorName.trim(),
      category: "Catering",
      raw_total_inr: Number(quoteTotal),
      normalized_per_head_inr: Number(perAttendee),
      items: [],
      includes_gst: inclusionValue(taxes),
      includes_generator_backup: inclusionValue(backup),
      includes_jain_counter: inclusionValue(jainMeals),
      includes_corkage: inclusionValue(corkage),
    };
    setError(null); setUploading(true);
    try {
      const response = await fetch(apiUrl("/api/vendor/compare"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, allocated_budget_max_inr: effectiveBudgetCap, guest_count: guestCount }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "We could not compare this quote. Please try again.");
      setComparison(payload as QuoteComparison);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not compare this quote."); }
    finally { setUploading(false); }
  };
  const copyMessage = async () => {
    if (!comparison) return;
    try { await navigator.clipboard.writeText(comparison.negotiation_script); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError("Copy is unavailable in this browser. Select the message and copy it instead."); }
  };
  const reset = () => { setComparison(null); setError(null); setCopied(false); };
  const inclusion = (label: string, value: Inclusion, change: (next: Inclusion) => void) => <label className="grid gap-1 text-sm">{label}<select className="field-control" value={value} onChange={(event) => change(event.target.value as Inclusion)}><option value="">Not stated</option><option value="included">Included</option><option value="excluded">Not included</option></select></label>;

  return <Dialog open={isOpen} label="Compare a vendor quote" onClose={onClose}>
    <header className="mb-5 flex items-start justify-between gap-4 border-b border-line/70 pb-4"><div><h2 className="text-2xl">Compare a quote</h2><p className="mt-1 text-sm text-muted">Enter values from the vendor's written quote. EvePlan does not fill in missing prices.</p></div><Button variant="quiet" aria-label="Close quote comparison" onClick={onClose}><X size={20} /></Button></header>
    {!comparison ? <form className="space-y-4" onSubmit={(event) => void compare(event)}>
      <p className="rounded-xl border border-accent/20 bg-accent-soft p-4 text-sm">The comparison uses the quote and catering allowance in your plan. If your plan has no catering allowance, enter one below. Inclusion fields are optional; excluded fees are shown for confirmation without estimated amounts.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Vendor name<input className="field-control" required maxLength={120} value={vendorName} onChange={(event) => setVendorName(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Quote total (₹)<input className="field-control" type="number" required min={0} step="0.01" value={quoteTotal} onChange={(event) => setQuoteTotal(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Per-attendee amount (₹, from quote)<input className="field-control" type="number" required min={0} step="0.01" value={perAttendee} onChange={(event) => setPerAttendee(event.target.value)} /></label>
        {allocatedCateringBudgetMaxInr === null && <label className="grid gap-1 text-sm">Catering budget cap (₹, from your plan)<input className="field-control" type="number" required min={0} step="1" value={manualBudgetCap} onChange={(event) => setManualBudgetCap(event.target.value)} /></label>}
        <p className="self-end pb-2 text-xs text-muted">Plan attendance: {guestCount.toLocaleString("en-IN")} · Catering allowance: {effectiveBudgetCap === null ? "Not set" : `₹${effectiveBudgetCap.toLocaleString("en-IN")}`}</p>
      </div>
      <fieldset className="grid gap-3 rounded-xl border border-line/70 bg-white/35 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Items the quote marks as included</legend>{inclusion("Applicable taxes", taxes, setTaxes)}{inclusion("Power backup", backup, setBackup)}{inclusion("Separate Jain meal preparation", jainMeals, setJainMeals)}{inclusion("Corkage or glassware", corkage, setCorkage)}</fieldset>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-muted">{uploading ? "Comparing entered amounts…" : ""}</p>
      <Button variant="primary" type="submit" disabled={uploading || effectiveBudgetCap === null}>{uploading ? "Comparing…" : "Compare quote"}</Button>
    </form> : <QuoteResults result={comparison} guestCount={guestCount} copied={copied} onCopy={() => void copyMessage()} onReset={reset} />}
  </Dialog>;
};

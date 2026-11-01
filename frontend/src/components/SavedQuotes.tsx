import { useState } from "react";
import type { EventPlan, SavedQuote, VendorCategory } from "../api/types";
import { useCurrentPlan, usePlanStore, planActions } from "../state/planStore";
import { Button, Dialog, GlassPanel } from "./ui";
import { apiUrl } from "../api/client";
import { formatMoney } from "../lib/format";

const categories: Record<VendorCategory, string> = { venue: "Venue", caterer: "Catering", decorator: "Décor", photographer: "Photography", makeup: "Makeup", music: "Music", transport: "Transport" };
const emptyQuote = (event_id: string, category: VendorCategory): SavedQuote => ({ id: crypto.randomUUID(), vendor_id: crypto.randomUUID(), vendor_name: "", event_id, category, original_inr: 0, finalized_inr: null, description: "", conditions: "", notes: "", budget_cap_inr: null, selected: false });
const label = (plan: EventPlan, id: string) => plan.days.flatMap(d => d.events).find(e => e.id === id)?.custom_name || plan.tasks.find(t => t.event_id === id)?.event_name || "Event";
const money = (n: number | null) => n === null ? "Not specified" : formatMoney(n);
type VendorAssessment = { quote_id: string; advantages: string[]; tradeoffs: string[] };
type Analysis = {
  winner_quote_id: string;
  confidence: "high" | "medium" | "low";
  winner_reason: string;
  vendor_assessments: VendorAssessment[];
  differences: string[];
  missing_details: string[];
  follow_up_questions: string[];
};

export function SavedQuotes({ comparison = false }: { comparison?: boolean }) {
  const current = useCurrentPlan();
  const fork = usePlanStore(s => s.forkedPlan);
  const [branch, setBranch] = useState<"A" | "B">(() => fork && new URLSearchParams(window.location.hash.split("?")[1]).get("branch") === "B" ? "B" : "A");
  const plan = branch === "B" && fork ? fork : current;
  return <div className="space-y-3"><div className="flex gap-2" role="group" aria-label="Quotation plan branch">{(["A", "B"] as const).map(b => <Button key={b} disabled={b === "B" && !fork} aria-pressed={branch === b} onClick={() => setBranch(b)}>Plan {b}</Button>)}</div><QuoteWorkspace key={`${branch}:${plan.id}`} plan={plan} branch={branch} comparison={comparison} /></div>;
}

function QuoteWorkspace({ plan, branch, comparison }: { plan: EventPlan; branch: "A" | "B"; comparison: boolean }) {
  const quotes = plan.saved_quotes ?? [];
  const requested = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const initialDay = plan.days.find(d => d.events.some(e => e.id === requested.get("event")))?.day_number ?? plan.days[0].day_number;
  const [day, setDay] = useState(initialDay);
  const events = plan.days.find(d => d.day_number === day)?.events ?? [];
  const [eventId, setEventId] = useState(requested.get("event") ?? events[0]?.id ?? "");
  const [category, setCategory] = useState<VendorCategory>((requested.get("category") as VendorCategory) || "decorator");
  const [editing, setEditing] = useState<SavedQuote | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<{ fingerprint: string; result: Analysis | null; message: string } | null>(null);
  const group = quotes.filter(q => q.event_id === eventId && q.category === category);
  const chosen = group.filter(q => !excluded.includes(q.id));
  const fingerprint = JSON.stringify({ plan, ids: chosen.map(q => q.id) });
  const run = async (action: () => Promise<void>) => { setBusy(true); setStatus(""); try { await action(); setStatus("Quotation changes saved."); } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); } };
  const save = (selected: boolean) => {
    if (!editing) return;
    const before = new Set(group.map(q => q.vendor_id));
    void run(async () => {
      await planActions.mutateQuote("save", { quote: { ...editing, selected } }, branch);
      setEditing(null);
      if (!quotes.some(q => q.id === editing.id) && !before.has(editing.vendor_id) && before.size === 1) setPrompt(true);
    });
  };
  const analyze = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/vendor/analyze-saved"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, quote_ids: chosen.map(q => q.id) }) });
      if (!res.ok) throw new Error("AI analysis could not be completed.");
      const data = await res.json(); setAnalysis({ fingerprint, result: data.analysis, message: data.message });
    } catch (e) { setStatus(e instanceof Error ? e.message : "AI unavailable."); } finally { setBusy(false); }
  };
  return <GlassPanel className="space-y-4">
    <h2 className="text-xl">{comparison ? "Compare Saved Quotes" : "Manual quotations"}</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <label>Day<select className="field-control" value={day} disabled={!!editing} onChange={e => { const n = Number(e.target.value); setDay(n); setEventId(plan.days.find(d => d.day_number === n)?.events[0]?.id ?? ""); }}>{plan.days.map(d => <option key={d.day_number} value={d.day_number}>Day {d.day_number}</option>)}</select></label>
      <label>Event<select className="field-control" value={eventId} disabled={!!editing} onChange={e => setEventId(e.target.value)}>{events.map(e => <option key={e.id} value={e.id}>{label(plan, e.id)}</option>)}</select></label>
      <label>Category<select className="field-control" value={category} disabled={!!editing} onChange={e => setCategory(e.target.value as VendorCategory)}>{Object.entries(categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    {!events.length && <p>No events on this day. Add an event in Events to enter a quotation.</p>}
    {!comparison && <Button disabled={!eventId || busy || !!editing} onClick={() => setEditing(emptyQuote(eventId, category))}>Add a Manual Quote</Button>}
    {editing && <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); save(editing.selected); }}>
      <label>Existing vendor<select className="field-control" value={quotes.some(q => q.vendor_id === editing.vendor_id) ? editing.vendor_id : ""} onChange={e => { const vendor = quotes.find(q => q.vendor_id === e.target.value); setEditing({ ...editing, vendor_id: vendor?.vendor_id ?? crypto.randomUUID(), vendor_name: vendor?.vendor_name ?? "" }); }}><option value="">New vendor</option>{Array.from(new Map(quotes.map(q => [q.vendor_id, q])).values()).map(q => <option key={q.vendor_id} value={q.vendor_id}>{q.vendor_name}</option>)}</select></label>
      <label>Vendor name<input required maxLength={120} className="field-control" value={editing.vendor_name} onChange={e => { const name = e.target.value; const vendor = quotes.find(q => q.vendor_name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()); setEditing({ ...editing, vendor_name: name, vendor_id: vendor?.vendor_id ?? editing.vendor_id }); }} /></label>
      <label>Vendor's quoted price (₹)<input required type="number" min={0} max={1e12} step="0.01" className="field-control" value={Number.isNaN(editing.original_inr) ? "" : editing.original_inr} onChange={e => setEditing({ ...editing, original_inr: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
      <label>Negotiated/finalized price (₹)<input type="number" min={0} max={1e12} step="0.01" className="field-control" value={editing.finalized_inr ?? ""} onChange={e => setEditing({ ...editing, finalized_inr: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label>Event/category budget cap (₹)<input type="number" min={0} max={1e12} step="0.01" className="field-control" value={editing.budget_cap_inr ?? ""} onChange={e => setEditing({ ...editing, budget_cap_inr: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      {([['description', 'Description / inclusions', 4000], ['conditions', 'Exclusions / conditions', 2000], ['notes', 'Notes', 2000]] as const).map(([key, name, max]) => <label key={key}>{name}<textarea className="field-control" maxLength={max} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /></label>)}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy || !editing.vendor_name.trim() || !Number.isFinite(editing.original_inr)}>{editing.selected ? "Save selected quote" : "Save Quote"}</Button><Button disabled={busy || editing.finalized_inr === null || !editing.vendor_name.trim() || !Number.isFinite(editing.original_inr)} onClick={e => { if (e.currentTarget.form?.reportValidity()) save(true); }}>Save &amp; Select for Budget</Button><Button disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
      {editing.finalized_inr === null && <p>Enter a finalized amount before selecting for budget.</p>}
    </form>}
    {!group.length && <p>No saved quotations for this event and category.</p>}
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{group.map(q => <article key={q.id} className="space-y-2 rounded-xl border border-line p-4">
      {comparison && <label className="flex gap-2"><input type="checkbox" checked={!excluded.includes(q.id)} onChange={e => setExcluded(e.target.checked ? excluded.filter(id => id !== q.id) : [...excluded, q.id])} />Include in analysis</label>}
      <h3 className="font-semibold">{q.vendor_name}</h3><p>Day {day} · {label(plan, q.event_id)} · {categories[q.category]}</p>
      <dl><dt>Original quotation</dt><dd>{money(q.original_inr)}</dd><dt>Finalized amount</dt><dd>{money(q.finalized_inr)}</dd><dt>Savings</dt><dd>{q.finalized_inr === null ? "Not specified" : money(q.original_inr - q.finalized_inr)}</dd><dt>Description / inclusions</dt><dd className="whitespace-pre-wrap">{q.description || "Not specified"}</dd><dt>Exclusions / conditions</dt><dd className="whitespace-pre-wrap">{q.conditions || "Not specified"}</dd><dt>Notes</dt><dd>{q.notes || "Not specified"}</dd><dt>Budget cap</dt><dd>{money(q.budget_cap_inr)}</dd><dt>Budget fit (including reserve)</dt><dd>{q.budget_cap_inr === null || q.finalized_inr === null ? "Not specified" : q.finalized_inr * (1 + (plan.contingency_percent ?? 10) / 100) <= q.budget_cap_inr ? "Within cap" : "Over cap"}</dd></dl>
      <p>{q.selected ? "Selected for budget" : "Saved alternative"}</p><p className="text-sm">Confirm taxes, setup, delivery and cancellation terms where not specified.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || q.selected || q.finalized_inr === null} onClick={() => void run(() => planActions.mutateQuote("select", { quote_id: q.id }, branch))}>Select for Budget</Button>{!comparison && <><Button disabled={busy || !!editing} onClick={() => setEditing(q)}>Edit</Button><Button disabled={busy} onClick={() => void run(() => planActions.mutateQuote("remove", { quote_id: q.id }, branch))}>Remove</Button></>}</div>
    </article>)}</div>
    {comparison && <><Button disabled={busy || chosen.length < 2 || chosen.length > 8 || (!!analysis?.result && analysis.fingerprint === fingerprint)} onClick={() => void analyze()}>Analyze with Groq</Button><p className="text-sm">Groq compares two to eight saved offers for this event and service. It recommends one vendor and explains the evidence; you make the final selection.</p>{analysis && analysis.fingerprint !== fingerprint && <p role="status">Inputs changed. Analyze again for current suggestions.</p>}{analysis?.fingerprint === fingerprint && <div aria-live="polite"><p>{analysis.message}</p>{analysis.result && <>
      {(() => { const winner = group.find(q => q.id === analysis.result?.winner_quote_id); return <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Groq’s recommendation · {analysis.result?.confidence} confidence</p><h3 className="mt-1 text-xl font-semibold">Recommended vendor: {winner?.vendor_name ?? "Saved quote"}</h3><p className="mt-2 text-sm">{analysis.result?.winner_reason}</p></section>; })()}
      <div className="grid gap-3 md:grid-cols-2">{analysis.result.vendor_assessments.map(item => { const vendor = group.find(q => q.id === item.quote_id); return <article key={item.quote_id} className="rounded-xl border border-line bg-white/50 p-4"><h4 className="font-semibold">{vendor?.vendor_name ?? "Vendor"}</h4><p className="mt-2 text-sm font-medium text-success">Advantages</p><ul className="list-disc pl-5 text-sm">{item.advantages.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="mt-2 text-sm font-medium text-danger">Trade-offs</p><ul className="list-disc pl-5 text-sm">{item.tradeoffs.map((text, i) => <li key={i}>{text}</li>)}</ul></article>; })}</div>
      {[...analysis.result.differences, ...analysis.result.missing_details, ...analysis.result.follow_up_questions].map((text, i) => <p key={i} className="text-sm">{text}</p>)}
    </>}</div>}</>}
    <p role="status">{busy ? "Working…" : status}</p>
    <Dialog open={prompt} label="Compare vendor quotations" onClose={() => setPrompt(false)}><p>You now have 2 {categories[category]?.toLowerCase()} quotations from distinct vendors for {label(plan, eventId)}. Would you like to compare them?</p><div className="mt-4 flex gap-2"><Button onClick={() => { window.location.hash = `/vendors?event=${encodeURIComponent(eventId)}&category=${category}&branch=${branch}`; setPrompt(false); }}>Compare vendors</Button><Button onClick={() => setPrompt(false)}>Later</Button></div></Dialog>
  </GlassPanel>;
}

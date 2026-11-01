import { useRequestController } from "../lib/useRequestController";
import React, { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { CatalogEvent, PlanEvent, VendorAssignment, VendorCategory } from "../api/types";
import { apiUrl } from "../api/client";
import { Button, GlassPanel } from "../components/ui";
import { SavedQuotes } from "../components/SavedQuotes";
import { VendorDiscovery } from "../components/VendorDiscovery";
import { useCurrentPlan, usePlanStore, planActions } from "../state/planStore";

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `manual-${Date.now()}`;
const noCategories: VendorCategory[] = [];
const interviewTemplates: Record<VendorCategory, string[]> = {
  venue: ["What is the confirmed guest capacity for this event?", "What is the indoor backup and accessibility setup?", "Which services and taxes are included in the written quote?"],
  caterer: ["What is included in the per-plate quote?", "Can you accommodate the counts the host entered for special diets?", "How are menu changes and final headcount changes priced?"],
  decorator: ["What materials and setup time are included?", "How do weather or venue changes affect the plan?", "Which items are reusable or separately quoted?"],
  photographer: ["How many hours and team members are included?", "When will edited photos and video be delivered?", "What are the usage and cancellation terms?"],
  makeup: ["How many people and looks are included?", "Are trials, travel, and touch-ups included?", "What is the start-time and cancellation policy?"],
  music: ["Which sound equipment and operators are included?", "How do you handle sound limits and power backup?", "What are the setup, rehearsal, and overtime terms?"],
  transport: ["How many vehicles and seats are included?", "How are timing changes and waiting time handled?", "What accessibility and backup options are available?"],
};

export const VendorsTab: React.FC = () => {
  const plan = useCurrentPlan();
  const { begin: beginRequest } = useRequestController();
  const forkedPlan = usePlanStore(state => state.forkedPlan);
  const onAssignVendor = (assignment: VendorAssignment, branch: "A" | "B") => planActions.assignVendor(assignment, branch, beginRequest());

  const [branch, setBranch] = useState<"A" | "B">("A");
  const activePlan = branch === "B" && forkedPlan ? forkedPlan : plan;
  const events = useMemo(() => activePlan.days.flatMap((day) => day.events.map((event) => ({ day, event }))), [activePlan.days]);
  const [eventId, setEventId] = useState(events[0]?.event.id ?? "");
  const [catalog, setCatalog] = useState<CatalogEvent[]>([]);
  const [category, setCategory] = useState<VendorCategory | "">("");
  const [city, setCity] = useState(activePlan.city);
  const [manualName, setManualName] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualQuote, setManualQuote] = useState("");
  const [manualCategoryCap, setManualCategoryCap] = useState("");
  const [manualCapacity, setManualCapacity] = useState("");
  const [status, setStatus] = useState("");
  const selected = events.find((item) => item.event.id === eventId);
  const metadata = selected?.event.catalog_id ? catalog.find((item) => item.id === selected.event.catalog_id) : null;
  const availableCategories = metadata?.vendor_categories_needed ?? selected?.event.vendor_categories ?? noCategories;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl("/api/plan/catalog"), { signal: controller.signal }).then((result) => result.json()).then((payload) => setCatalog(payload.events ?? [])).catch(() => !controller.signal.aborted && setStatus("Catalog needs could not be loaded."));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!events.some((item) => item.event.id === eventId)) setEventId(events[0]?.event.id ?? "");
  }, [eventId, events]);
  useEffect(() => { setCity(activePlan.city); }, [activePlan.id, branch, activePlan.city]);
  useEffect(() => {
    if (!availableCategories.includes(category as VendorCategory)) setCategory(availableCategories[0] ?? "");
  }, [eventId, availableCategories, category]);

  const addManual = async () => {
    if (!selected || !category || !manualName.trim()) return;
    try {
      await onAssignVendor({
        event_id: selected.event.id,
        category,
        place_id: `manual:${makeId()}`,
        notes: [`Vendor name: ${manualName.trim()}`, manualNotes.trim()].filter(Boolean).join("\n"),
        quoted_total_inr: manualQuote ? Number(manualQuote) : null,
        category_budget_cap_inr: manualCategoryCap ? Number(manualCategoryCap) : null,
        capacity: manualCapacity ? Number(manualCapacity) : null,
      }, branch);
      setManualName(""); setManualNotes(""); setManualQuote(""); setManualCategoryCap(""); setManualCapacity("");
      setStatus("Manual vendor entry assigned to this event.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Manual vendor entry could not be saved.");
    }
  };

  const eventLabel = (event: PlanEvent) => event.custom_name || catalog.find((item) => item.id === event.catalog_id)?.display_name || "Event";
  const brief = selected && category ? [
    `Vendor brief · ${category}`,
    `Event: ${eventLabel(selected.event)} · Day ${selected.day.day_number} · ${selected.day.date ?? "date pending"}`,
    `Guests: ${selected.event.guest_count ?? activePlan.guest_count} · City: ${city || "not entered"}`,
    selected.event.venue_type ? `Venue type: ${selected.event.venue_type}` : "",
    category === "caterer" ? `Special-diet counts entered: ${Object.entries(activePlan.special_diets).map(([name, count]) => `${name} ${count}`).join(", ") || "none entered"}` : "",
    `Please provide an itemized quote, capacity, included services, and cancellation terms.`,
  ].filter(Boolean).join("\n") : "";

  return <div className="space-y-4">
    <SavedQuotes comparison />
    <GlassPanel><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Vendor search</p><h1 className="mt-1 text-2xl">Vendors</h1><p className="mt-1 text-sm text-muted">Discover vendors on Google Maps, then enter your chosen vendor and written quote here.</p></div><div className="flex gap-2" role="group" aria-label="Plan branch">{(["A", "B"] as const).map((item) => <Button key={item} disabled={item === "B" && !forkedPlan} variant={branch === item ? "primary" : "quiet"} onClick={() => setBranch(item)}>Plan {item}{item === "B" && !forkedPlan ? " (fork first)" : ""}</Button>)}</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Event<select className="field-control" value={eventId} onChange={(change) => setEventId(change.target.value)}>{events.map(({ event }) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select></label></div>
      <div className="mt-3 flex min-h-24 flex-wrap content-start gap-2 sm:min-h-12" role="group" aria-label="Vendor category">{availableCategories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`min-h-11 rounded-full border px-4 text-sm capitalize ${category === item ? "border-accent bg-accent text-white" : "border-line bg-white/55"}`}>{item}</button>)}</div>
      {!availableCategories.length && <p className="mt-3 text-sm text-muted">This custom event has no vendor categories yet. Add needs on the Events tab to search.</p>}
      <div className="min-h-16">{category && <details className="mt-3 rounded-xl border border-line/70 bg-white/45 p-3"><summary className="cursor-pointer font-semibold">Vendor brief and interview questions</summary><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><label className="grid gap-1 text-sm font-medium">Copy-ready brief<textarea className="field-control min-h-28" readOnly value={brief} /></label><Button className="mt-2" onClick={() => void navigator.clipboard?.writeText(brief)}>Copy brief</Button></div><ul className="space-y-2 text-sm" aria-label="Interview questions">{interviewTemplates[category].map((question) => <li key={question} className="rounded-lg bg-white/65 p-2">{question}</li>)}</ul></div><p className="mt-2 text-xs text-muted">Template built from the event and host-entered needs. Confirm details with each vendor.</p></details>}</div>
      <p className="mt-3 min-h-5 text-xs text-muted" aria-live="polite">{status}</p>
    </GlassPanel>

    <VendorDiscovery category={category} city={city} onCityChange={setCity} eventType={selected ? eventLabel(selected.event) : ""} />

    <GlassPanel className="space-y-3"><h2 className="flex items-center gap-2 text-xl"><UserPlus size={18} />Manual vendor entry</h2><p className="text-sm text-muted">Enter the vendor's name, notes, quote, category budget, and capacity yourself.</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Vendor name<input className="field-control" value={manualName} onChange={(change) => setManualName(change.target.value)} /></label><label className="grid gap-1 text-sm">Your quote (₹)<input className="field-control" type="number" min={0} value={manualQuote} onChange={(change) => setManualQuote(change.target.value)} /></label><label className="grid gap-1 text-sm">Category budget (₹)<input className="field-control" type="number" min={0} value={manualCategoryCap} onChange={(change) => setManualCategoryCap(change.target.value)} /></label><label className="grid gap-1 text-sm">Capacity<input className="field-control" type="number" min={1} value={manualCapacity} onChange={(change) => setManualCapacity(change.target.value)} /></label><label className="grid gap-1 text-sm">Your notes<input className="field-control" value={manualNotes} maxLength={2000} onChange={(change) => setManualNotes(change.target.value)} /></label></div><Button variant="primary" disabled={!manualName.trim() || !selected || !category} onClick={() => void addManual()}><Search size={16} />Pick manual vendor for this event</Button></GlassPanel>
  </div>;
};

import { useRequestController } from "../lib/useRequestController";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, MapPinned, Search, UserPlus } from "lucide-react";
import type { CatalogEvent, PlanEvent, VendorAssignment, VendorCategory, VendorSearchResult } from "../api/types";
import { apiUrl } from "../api/client";
import { Button, EmptyState, GlassPanel } from "../components/ui";
import { VendorMapPanel } from "../components/VendorMapPanel";
import { VendorResultCard } from "../components/VendorResultCard";
import { useCurrentPlan, usePlanStore, planActions } from "../state/planStore";

interface SearchPayload { mode: "google_places" | "maps_link"; results: VendorSearchResult[]; map_search_url: string | null; banner: string | null; attribution?: string | null }
interface Shortlisted { result: VendorSearchResult; quote: number | null; categoryCap: number | null; capacity: number | null }
interface SearchViewport { lat: number; lng: number; radius_m: number }
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
  const [searchMode, setSearchMode] = useState<"city" | "viewport">("city");
  const [viewport, setViewport] = useState<SearchViewport | null>(null);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [response, setResponse] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [shortlist, setShortlist] = useState<Shortlisted[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualQuote, setManualQuote] = useState("");
  const [manualCategoryCap, setManualCategoryCap] = useState("");
  const [manualCapacity, setManualCapacity] = useState("");
  const [status, setStatus] = useState("");
  const browserKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const selected = events.find((item) => item.event.id === eventId);
  const metadata = selected?.event.catalog_id ? catalog.find((item) => item.id === selected.event.catalog_id) : null;
  const availableCategories = metadata?.vendor_categories_needed ?? selected?.event.vendor_categories ?? noCategories;
  const searchViewport = searchMode === "viewport" ? viewport : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl("/api/plan/catalog"), { signal: controller.signal }).then((result) => result.json()).then((payload) => setCatalog(payload.events ?? [])).catch(() => !controller.signal.aborted && setStatus("Catalog needs could not be loaded."));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!events.some((item) => item.event.id === eventId)) setEventId(events[0]?.event.id ?? "");
  }, [eventId, events]);
  useEffect(() => { setCity(activePlan.city); setResults([]); setResponse(null); setShortlist([]); }, [activePlan.id, branch, activePlan.city]);
  useEffect(() => {
    if (!availableCategories.includes(category as VendorCategory)) setCategory(availableCategories[0] ?? "");
  }, [eventId, availableCategories, category]);

  const onMapUnavailable = useCallback(() => { setMapUnavailable(true); setMapReady(false); setResults([]); }, []);
  const onMapReady = useCallback(() => { setMapUnavailable(false); setMapReady(true); }, []);
  const onViewportChange = useCallback((next: SearchViewport) => {
    setViewport((current) => current
      && Math.abs(current.lat - next.lat) < 0.001
      && Math.abs(current.lng - next.lng) < 0.001
      && Math.abs(current.radius_m - next.radius_m) < 200
      ? current
      : next);
  }, []);

  useEffect(() => {
    if (!eventId || !category || (searchMode === "city" && !city.trim()) || (searchMode === "viewport" && !searchViewport)) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!browserKey || mapUnavailable) {
        const query = [category, keyword.trim(), searchMode === "city" ? city.trim() : `${searchViewport?.lat.toFixed(3)}, ${searchViewport?.lng.toFixed(3)}`].filter(Boolean).join(" ");
        setResponse({ mode: "maps_link", results: [], map_search_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, banner: null });
        setResults([]); return;
      }
      if (!mapReady) return;
      setLoading(true); setStatus("");
      const searchArea = searchMode === "city"
        ? { city: city.trim() }
        : { lat: searchViewport?.lat, lng: searchViewport?.lng, radius_m: searchViewport?.radius_m };
      void fetch(apiUrl("/api/vendors/search"), {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, ...searchArea, keyword: keyword.trim() || undefined }),
      }).then(async (result) => {
        const data = await result.json();
        if (!result.ok) throw new Error(data.detail || "Vendor search failed.");
        const payload = data as SearchPayload;
        setResponse(payload); setResults(payload.mode === "google_places" ? payload.results.slice(0, 20) : []);
      }).catch((error) => { if (error.name !== "AbortError") setStatus("Vendor search is unavailable. Use Maps search or manual entry."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [browserKey, category, city, eventId, keyword, mapReady, mapUnavailable, searchMode, searchViewport]);

  const pick = async (assignment: VendorAssignment) => {
    if (!selected || !category) return;
    try {
      await onAssignVendor({ ...assignment, event_id: selected.event.id, category }, branch);
      setStatus(`${assignment.category} vendor assigned to ${selected.event.custom_name || metadata?.display_name || "this event"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Vendor assignment could not be saved.");
    }
  };

  const addShortlist = (result: VendorSearchResult, quote: number | null, categoryCap: number | null, capacity: number | null) => {
    setShortlist((current) => current.some((item) => item.result.place_id === result.place_id) ? current : [...current, { result, quote, categoryCap, capacity }]);
  };

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
    <GlassPanel><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Vendor search</p><h1 className="mt-1 text-2xl">Vendors</h1><p className="mt-1 text-sm text-muted">Results are attached to the Google map and are never saved into the plan.</p></div><div className="flex gap-2" role="group" aria-label="Plan branch">{(["A", "B"] as const).map((item) => <Button key={item} disabled={item === "B" && !forkedPlan} variant={branch === item ? "primary" : "quiet"} onClick={() => setBranch(item)}>Plan {item}{item === "B" && !forkedPlan ? " (fork first)" : ""}</Button>)}</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Event<select className="field-control" value={eventId} onChange={(change) => setEventId(change.target.value)}>{events.map(({ event }) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select></label><label className="grid gap-1 text-sm">City<input className="field-control" value={city} maxLength={120} onChange={(change) => setCity(change.target.value)} /></label><label className="grid gap-1 text-sm">Keyword<input className="field-control" value={keyword} maxLength={80} onChange={(change) => setKeyword(change.target.value)} placeholder="Optional" /></label></div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Search area"><Button variant={searchMode === "city" ? "primary" : "quiet"} aria-pressed={searchMode === "city"} onClick={() => setSearchMode("city")}>Search city</Button><Button variant={searchMode === "viewport" ? "primary" : "quiet"} aria-pressed={searchMode === "viewport"} disabled={!browserKey || !mapReady || mapUnavailable || !viewport} onClick={() => setSearchMode("viewport")}>Search visible map area</Button>{searchMode === "viewport" && viewport && <span className="text-xs text-muted" aria-live="polite">Map center {viewport.lat.toFixed(3)}, {viewport.lng.toFixed(3)} · about {Math.round(viewport.radius_m / 1000)} km radius</span>}</div>
      <div className="mt-3 flex min-h-24 flex-wrap content-start gap-2 sm:min-h-12" role="group" aria-label="Vendor category">{availableCategories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`min-h-11 rounded-full border px-4 text-sm capitalize ${category === item ? "border-accent bg-accent text-white" : "border-line bg-white/55"}`}>{item}</button>)}</div>
      {!availableCategories.length && <p className="mt-3 text-sm text-muted">This custom event has no vendor categories yet. Add needs on the Events tab to search.</p>}
      <div className="min-h-16">{category && <details className="mt-3 rounded-xl border border-line/70 bg-white/45 p-3"><summary className="cursor-pointer font-semibold">Vendor brief and interview questions</summary><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><label className="grid gap-1 text-sm font-medium">Copy-ready brief<textarea className="field-control min-h-28" readOnly value={brief} /></label><Button className="mt-2" onClick={() => void navigator.clipboard?.writeText(brief)}>Copy brief</Button></div><ul className="space-y-2 text-sm" aria-label="Interview questions">{interviewTemplates[category].map((question) => <li key={question} className="rounded-lg bg-white/65 p-2">{question}</li>)}</ul></div><p className="mt-2 text-xs text-muted">Template built from the event and host-entered needs. Confirm details with each vendor.</p></details>}</div>
      <p className="mt-3 min-h-5 text-xs text-muted" aria-live="polite">{loading ? "Searching vendors…" : status}</p>
    </GlassPanel>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)]">
      <section className="min-h-[180px] space-y-3" aria-label="Vendor results">
        <h2 className="sr-only">Vendor search results</h2>
        {response?.banner && <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">{response.banner}</p>}
        {response?.map_search_url && <a href={response.map_search_url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white/75 px-4 text-sm font-semibold text-accent underline"><MapPinned size={17} />Open in Google Maps</a>}
        {results.length > 0 && mapReady && !mapUnavailable ? results.slice(0, 20).map((result) => <VendorResultCard key={result.place_id} result={result} category={category as VendorCategory} onShortlist={addShortlist} onPick={(assignment) => void pick(assignment)} />) : !response?.map_search_url && !loading && <EmptyState title="Search vendors for an event">Choose an event, category, and city. Search results will appear here and on the Google map.</EmptyState>}
        {browserKey && mapReady && response?.mode === "google_places" && response.attribution && <p className="text-xs text-muted">{response.attribution} · Results shown on a Google map.</p>}
        {status && <p role="alert" className="text-sm text-danger">{status}</p>}
      </section>
      <VendorMapPanel results={results} enabled={Boolean(browserKey)} centerOnResults={searchMode === "city"} onUnavailable={onMapUnavailable} onReady={onMapReady} onViewportChange={onViewportChange} />
    </div>

    {shortlist.length > 0 && <GlassPanel className="space-y-3"><h2 className="flex items-center gap-2 text-xl"><Bookmark size={18} />Shortlist comparison</h2><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-line"><th className="p-2">Vendor</th><th className="p-2">Address</th><th className="p-2 text-right">Your quote</th><th className="p-2 text-right">Category budget</th><th className="p-2 text-right">Capacity</th><th className="p-2">Action</th></tr></thead><tbody>{shortlist.map((item) => <tr key={item.result.place_id} className="border-b border-line/60"><td className="p-2 font-medium">{item.result.display_name}</td><td className="p-2">{item.result.formatted_address}</td><td className="p-2 text-right">{item.quote === null ? "—" : `₹${item.quote.toLocaleString("en-IN")}`}</td><td className="p-2 text-right">{item.categoryCap === null ? "—" : `₹${item.categoryCap.toLocaleString("en-IN")}`}</td><td className="p-2 text-right">{item.capacity ?? "—"}</td><td className="p-2"><Button onClick={() => setShortlist((current) => current.filter((candidate) => candidate.result.place_id !== item.result.place_id))}>Remove</Button></td></tr>)}</tbody></table></div><p className="text-xs text-muted">Shortlist data is kept in this tab only. Names and addresses are not written to the plan.</p></GlassPanel>}

    {(!browserKey || response?.mode === "maps_link" || mapUnavailable) && <GlassPanel className="space-y-3"><h2 className="flex items-center gap-2 text-xl"><UserPlus size={18} />Manual vendor entry</h2><p className="text-sm text-muted">Works without Maps keys or search quota. Enter the vendor's name, notes, quote, category budget, and capacity yourself.</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Vendor name<input className="field-control" value={manualName} onChange={(change) => setManualName(change.target.value)} /></label><label className="grid gap-1 text-sm">Your quote (₹)<input className="field-control" type="number" min={0} value={manualQuote} onChange={(change) => setManualQuote(change.target.value)} /></label><label className="grid gap-1 text-sm">Category budget (₹)<input className="field-control" type="number" min={0} value={manualCategoryCap} onChange={(change) => setManualCategoryCap(change.target.value)} /></label><label className="grid gap-1 text-sm">Capacity<input className="field-control" type="number" min={1} value={manualCapacity} onChange={(change) => setManualCapacity(change.target.value)} /></label><label className="grid gap-1 text-sm">Your notes<input className="field-control" value={manualNotes} maxLength={2000} onChange={(change) => setManualNotes(change.target.value)} /></label></div><Button variant="primary" disabled={!manualName.trim() || !selected || !category} onClick={() => void addManual()}><Search size={16} />Pick manual vendor for this event</Button></GlassPanel>}
  </div>;
};

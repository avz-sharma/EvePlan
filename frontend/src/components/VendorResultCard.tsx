import React, { useState } from "react";
import { BookmarkPlus, CircleDollarSign, MapPin, Phone, Star } from "lucide-react";
import type { VendorAssignment, VendorCategory, VendorSearchResult } from "../api/types";
import { apiUrl } from "../api/client";
import { Button } from "./ui";

interface Details { rating?: number | null; phone?: string | null; website?: string | null }
interface Props {
  result: VendorSearchResult;
  category: VendorCategory;
  onShortlist: (result: VendorSearchResult, quote: number | null, categoryCap: number | null, capacity: number | null) => void;
  onPick: (assignment: VendorAssignment) => void;
}

export const VendorResultCard: React.FC<Props> = ({ result, category, onShortlist, onPick }) => {
  const [quote, setQuote] = useState("");
  const [categoryCap, setCategoryCap] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const assignment = (): VendorAssignment => ({
    event_id: "",
    category,
    place_id: result.place_id,
    notes,
    quoted_total_inr: quote ? Number(quote) : null,
    category_budget_cap_inr: categoryCap ? Number(categoryCap) : null,
    capacity: capacity ? Number(capacity) : null,
  });

  const loadDetails = async () => {
    setLoadingDetails(true); setDetailError("");
    try {
      const response = await fetch(apiUrl(`/api/vendors/${encodeURIComponent(result.place_id)}`));
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Details could not be loaded.");
      setDetails(data);
    } catch (error) { setDetailError(error instanceof Error ? error.message : "Details could not be loaded."); }
    finally { setLoadingDetails(false); }
  };

  return <article className="rounded-2xl border border-line/80 bg-white/65 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{result.display_name}</h3><p className="mt-1 flex items-start gap-1 text-sm text-muted"><MapPin size={15} className="mt-0.5 shrink-0" />{result.formatted_address || "Address not provided"}</p></div><a className="rounded-lg px-3 py-2 text-sm font-semibold text-accent underline" href={result.maps_url} target="_blank" rel="noreferrer">Open in Maps</a></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-xs text-muted">Your quote (₹, optional)<input className="field-control" type="number" min={0} value={quote} onChange={(event) => setQuote(event.target.value)} /></label>
      <label className="grid gap-1 text-xs text-muted">Category budget (₹, optional)<input className="field-control" type="number" min={0} value={categoryCap} onChange={(event) => setCategoryCap(event.target.value)} /></label>
      <label className="grid gap-1 text-xs text-muted">Capacity (optional)<input className="field-control" type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
      <label className="grid gap-1 text-xs text-muted sm:col-span-2">Your notes<input className="field-control" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contact notes, quote terms, or follow-up" /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => onShortlist(result, quote ? Number(quote) : null, categoryCap ? Number(categoryCap) : null, capacity ? Number(capacity) : null)}><BookmarkPlus size={16} />Shortlist</Button><Button variant="primary" onClick={() => onPick(assignment())}><CircleDollarSign size={16} />Pick for this event</Button><Button disabled={loadingDetails} onClick={() => void loadDetails()}>{loadingDetails ? "Loading…" : "Show rating and contact"}</Button></div>
    {detailError && <p role="alert" className="mt-2 text-sm text-danger">{detailError}</p>}
    {details && <p className="mt-3 flex flex-wrap gap-3 rounded-xl bg-accent/5 p-3 text-sm" aria-live="polite"><span><Star size={14} className="mr-1 inline" />{details.rating ?? "No rating"}</span>{details.phone && <span><Phone size={14} className="mr-1 inline" />{details.phone}</span>}{details.website && <a className="text-accent underline" target="_blank" rel="noreferrer" href={details.website}>Website</a>}<span className="text-muted">Google Maps</span></p>}
  </article>;
};

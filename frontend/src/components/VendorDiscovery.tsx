import { useEffect, useState } from "react";
import type { VendorCategory } from "../api/types";
import { generateGoogleMapsSearchUrl } from "../lib/googleMapsUrl";
import { vendorDiscoveryCategories } from "../lib/vendorDiscoveryCategories";
import { Button, GlassPanel } from "./ui";

/** Build explicit external Maps searches from host-selected service and location. */
export function VendorDiscovery({ category, city, onCityChange, eventType }: {
  category: VendorCategory | ""; city: string; onCityChange: (city: string) => void; eventType: string;
}) {
  const [event, setEvent] = useState(eventType);
  const [variant, setVariant] = useState("");
  const [keyword, setKeyword] = useState("");
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const variants = category ? vendorDiscoveryCategories[category] : [];
  const service = variants.includes(variant) ? variant : variants[0] ?? "";
  useEffect(() => { setEvent(eventType); }, [eventType]);
  useEffect(() => { setSearched(false); setError(""); }, [category, city, event, keyword, service]);
  let url = "";
  try { url = generateGoogleMapsSearchUrl(service, city, event, keyword); } catch { /* Validate on submit. */ }
  const query = url ? new URL(url).searchParams.get("query") : "";
  return <GlassPanel className="space-y-4">
    <h2 className="text-xl">Discover vendors</h2>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={change => {
      change.preventDefault();
      try { generateGoogleMapsSearchUrl(service, city, event, keyword); setError(""); setSearched(true); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Check your search details."); }
    }} noValidate>
      <label className="grid gap-1 text-sm">Event type<input id="discovery-start" className="field-control" maxLength={80} value={event} onChange={change => setEvent(change.target.value)} placeholder="Wedding, birthday, celebration…" /></label>
      <label className="grid gap-1 text-sm">Service<select className="field-control" value={service} onChange={change => setVariant(change.target.value)}><option value="" disabled>Choose a category above</option>{variants.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-sm">City<input className="field-control" maxLength={120} value={city} onChange={change => onCityChange(change.target.value)} aria-invalid={Boolean(error && !city.trim())} /></label>
      <label className="grid gap-1 text-sm">Keyword<input className="field-control" maxLength={80} value={keyword} onChange={change => setKeyword(change.target.value)} placeholder="Optional, e.g. vegetarian" /></label>
      <Button type="submit" variant="primary">Find {service || "vendors"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {searched && url && <section className="space-y-3 rounded-2xl border border-line bg-white/60 p-4" aria-label="Maps search action" aria-live="polite">
      <h3 className="font-semibold">{service} · {city.trim()}</h3><p>{query}</p>
      <a className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white" href={url} target="_blank" rel="noopener noreferrer">Search on Google Maps</a>
      <p className="text-sm text-muted">Opens externally in a new tab or your Maps app. Browse businesses there; no listings or ratings are imported here.</p>
      <p className="text-xs text-muted">If a new tab is blocked, copy the link or use your browser’s link menu to open it.</p>
      <Button onClick={() => { setSearched(false); document.getElementById("discovery-start")?.focus(); }}>Search More Vendors</Button>
    </section>}
    <p className="text-sm text-muted">Only the service, event type, location and optional keyword are sent to Google when you open the link. Keep personal details out of search fields.</p>
  </GlassPanel>;
}

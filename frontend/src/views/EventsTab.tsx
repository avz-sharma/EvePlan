import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { CatalogEvent, CascadeDiff, EventPlan, PlanEvent, TimeSlot, VendorCategory } from "../api/types";
import { apiUrl } from "../api/client";
import { Button, GlassPanel } from "../components/ui";
import { useCurrentPlan, planActions } from "../state/planStore";

const categories: VendorCategory[] = ["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"];
const slots: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}`;

export const EventsTab: React.FC = () => {
  const plan = useCurrentPlan();
  const onPlanUpdated = planActions.updated;

  const [catalog, setCatalog] = useState<CatalogEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDay, setCustomDay] = useState(1);
  const [customCategories, setCustomCategories] = useState<VendorCategory[]>([]);
  const [countDrafts, setCountDrafts] = useState<Record<string, number>>({});

  useEffect(() => {
    void fetch(apiUrl("/api/plan/catalog")).then((response) => response.json()).then((payload) => setCatalog(payload.events ?? [])).catch(() => setError("Event catalog could not be loaded."));
  }, []);

  const eventName = useMemo(() => (event: PlanEvent) => event.custom_name || catalog.find((item) => item.id === event.catalog_id)?.display_name || "Event", [catalog]);

  const apply = async (operation: string, payload: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(apiUrl("/api/plan/events/edit"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, operation, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "The event change could not be applied.");
      onPlanUpdated(result.updated_plan as EventPlan, result.diff as CascadeDiff);
      setCountDrafts({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The event change could not be applied."); }
    finally { setBusy(false); }
  };

  const addCatalogEvent = (dayNumber: number) => {
    const metadata = catalog.find((item) => item.id === selectedCatalog);
    if (!metadata) return;
    const event: PlanEvent = { id: makeId(), catalog_id: metadata.id, custom_name: null, time_slot: metadata.time_of_day, guest_count: plan.guest_count, venue_type: null, vendor_categories: [] };
    void apply("add_event", { day_number: dayNumber, event });
    setSelectedCatalog("");
  };

  const addCustomEvent = () => {
    if (!customName.trim()) return;
    const event: PlanEvent = { id: makeId(), catalog_id: null, custom_name: customName.trim(), time_slot: "evening", guest_count: plan.guest_count, venue_type: null, vendor_categories: customCategories };
    void apply("add_event", { day_number: customDay, event });
    setCustomName(""); setCustomCategories([]);
  };

  return <div className="space-y-4">
    <GlassPanel className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Plan structure</p><h1 className="mt-1 text-2xl">Events</h1><p className="mt-1 text-sm text-muted">Changes rebuild this event's tasks, dates, and budget effects.</p></div>
      {error && <p role="alert" aria-live="assertive" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {plan.days.map((day, index) => <section key={day.day_number} className="rounded-2xl border border-line/70 bg-white/40 p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg">Day {day.day_number}</h2><p className="text-sm text-muted">{day.date || "Date will follow the first event date"}</p></div><div className="flex gap-2"><Button disabled={busy || index === 0} aria-label={`Move day ${day.day_number} earlier`} onClick={() => void apply("reorder_days", { day_number: day.day_number, target_day_number: day.day_number - 1 })}><ArrowUp size={16} /></Button><Button disabled={busy || index === plan.days.length - 1} aria-label={`Move day ${day.day_number} later`} onClick={() => void apply("reorder_days", { day_number: day.day_number, target_day_number: day.day_number + 1 })}><ArrowDown size={16} /></Button><Button disabled={busy || plan.days.length <= 1} onClick={() => void apply("remove_day", { day_number: day.day_number })}>Remove day</Button></div></header>
        <div className="space-y-3">{day.events.map((event) => {
          const count = countDrafts[event.id] ?? event.guest_count ?? plan.guest_count;
          const metadata = catalog.find((item) => item.id === event.catalog_id);
          return <article key={event.id} className="rounded-xl border border-line/70 bg-white/65 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{eventName(event)}</h3><p className="text-sm capitalize text-muted">{event.time_slot}{event.venue_type ? ` · ${event.venue_type}` : ""}</p><p className="mt-1 text-xs text-muted">Vendor categories: {(metadata?.vendor_categories_needed ?? event.vendor_categories).join(", ") || "Set for custom event"}</p></div><Button disabled={busy} aria-label={`Remove ${eventName(event)}`} onClick={() => void apply("remove_event", { event_id: event.id })}><Trash2 size={16} />Remove</Button></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-sm">Guests for this event<input className="field-control" type="number" min={1} max={plan.guest_count} value={count} onChange={(change) => setCountDrafts((current) => ({ ...current, [event.id]: Number(change.target.value) || 0 }))} /></label><label className="grid gap-1 text-sm">Time of day<select className="field-control" value={event.time_slot} onChange={(change) => void apply("update_event", { event_id: event.id, event: { ...event, time_slot: change.target.value } })}>{slots.map((slot) => <option key={slot}>{slot}</option>)}</select></label><label className="grid gap-1 text-sm">Venue type<input className="field-control" value={event.venue_type ?? ""} placeholder="Optional" onBlur={(change) => { const value = change.target.value.trim() || null; if (value !== event.venue_type) void apply("update_event", { event_id: event.id, event: { ...event, venue_type: value } }); }} /></label></div>
            <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy || count < 1 || count === event.guest_count} variant="primary" onClick={() => void apply("set_guest_count", { event_id: event.id, guest_count: count })}>Save guest count</Button><label className="flex items-center gap-2 text-sm">Move to day<select className="field-control min-w-24" value={day.day_number} onChange={(change) => { const target = Number(change.target.value); if (target !== day.day_number) void apply("move_event", { event_id: event.id, target_day_number: target }); }}>{plan.days.map((option) => <option key={option.day_number} value={option.day_number}>{option.day_number}</option>)}</select></label></div>
          </article>;
        })}</div>
        <div className="mt-4 flex flex-wrap items-end gap-2"><label className="grid min-w-52 flex-1 gap-1 text-sm">Add catalog event<select className="field-control" value={selectedCatalog} onChange={(change) => setSelectedCatalog(change.target.value)}><option value="">Choose event</option>{catalog.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label><Button disabled={busy || !selectedCatalog} onClick={() => addCatalogEvent(day.day_number)}><Plus size={16} />Add event</Button></div>
      </section>)}
      <div className="rounded-2xl border border-dashed border-line p-4"><h2 className="mb-2 font-semibold">Add your own event</h2><div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"><label className="grid gap-1 text-sm">Event name<input className="field-control" value={customName} maxLength={120} onChange={(change) => setCustomName(change.target.value)} /></label><label className="grid gap-1 text-sm">Day<select className="field-control" value={customDay} onChange={(change) => setCustomDay(Number(change.target.value))}>{plan.days.map((day) => <option key={day.day_number}>{day.day_number}</option>)}</select></label><Button disabled={busy || !customName.trim()} variant="primary" onClick={addCustomEvent}><Plus size={16} />Add custom event</Button></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{categories.map((category) => <label key={category} className="flex min-h-10 items-center gap-1 text-sm capitalize"><input type="checkbox" checked={customCategories.includes(category)} onChange={(change) => setCustomCategories((current) => change.target.checked ? [...current, category] : current.filter((item) => item !== category))} />{category}</label>)}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted" aria-live="polite">{busy ? "Rebuilding the plan…" : `${plan.days.length} days · ${plan.days.reduce((sum, day) => sum + day.events.length, 0)} events`}</p><Button disabled={busy || plan.days.length >= 5} onClick={() => void apply("add_day", {})}><Plus size={16} />Add a day</Button></div>
    </GlassPanel>
  </div>;
};

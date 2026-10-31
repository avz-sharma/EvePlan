import { useRequestController } from "../lib/useRequestController";
import React, { useEffect, useMemo, useState } from "react";
import type { CatalogEvent, EventDay, EventPlan, PlanEvent, TimeSlot, VendorCategory } from "../api/types";
import { apiUrl } from "../api/client";
import { Button, Dialog } from "./ui";

interface ExampleSelection { id: string; title: string; days: EventDay[]; requires_special_diets: boolean }
interface MappingSuggestion { catalog_id: string; display_name: string; source: string }
interface Props { isOpen: boolean; onClose: () => void; onPlanCreated: (plan: EventPlan) => void }
const slots: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
const categories: VendorCategory[] = ["venue", "caterer", "decorator", "photographer", "makeup", "music", "transport"];
const diets = ["jain", "halal", "vegetarian", "vegan", "no_alcohol"];

const blankPlan = (): EventPlan => ({
  id: "", title: "", template: "celebration", guest_count: 0, total_budget_cap_inr: 0,
  budget_range_min_inr: 0, budget_range_max_inr: 0, per_plate_min_inr: 0, per_plate_max_inr: 0,
  days_until_event: 0, dietary_split: { regular: 0, jain: 0, vegan: 0, kids: 0 },
  accessibility: { elderly_count: 0, wheelchair_access_required: false, ground_floor_dining: false },
  sub_events: [], budget_buckets: [], tasks: [], notes: [], city: "", first_event_date: null,
  days: [{ day_number: 1, date: null, events: [] }], special_diets: {}, accessibility_needs: [],
  elder_members: 0, vendor_assignments: [],
});

function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export const OnboardingWizard: React.FC<Props> = ({ isOpen, onClose, onPlanCreated }) => {
  const { begin: beginRequest, cancel: cancelRequest } = useRequestController();
  const [form, setForm] = useState<EventPlan>(blankPlan);
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState<CatalogEvent[]>([]);
  const [examples, setExamples] = useState<ExampleSelection[]>([]);
  const [customDay, setCustomDay] = useState<number | null>(null);
  const [customName, setCustomName] = useState("");
  const [customSlot, setCustomSlot] = useState<TimeSlot>("evening");
  const [customCategories, setCustomCategories] = useState<VendorCategory[]>([]);
  const [mappingSuggestion, setMappingSuggestion] = useState<MappingSuggestion | null>(null);
  const [useMappingSuggestion, setUseMappingSuggestion] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(apiUrl("/api/plan/catalog"), { signal: controller.signal }).then((response) => response.json()),
      fetch(apiUrl("/api/plan/examples"), { signal: controller.signal }).then((response) => response.json()),
    ]).then(([catalogPayload, examplePayload]) => {
      setCatalog(catalogPayload.events ?? []);
      setExamples(examplePayload ?? []);
      setNotice(catalogPayload.notice ?? "");
    }).catch(() => !controller.signal.aborted && setError("Event examples could not be loaded. You can still add a custom event."));
    return () => controller.abort();
  }, [isOpen]);

  const eventCount = useMemo(() => form.days.reduce((sum, day) => sum + day.events.length, 0), [form.days]);
  const updateDayCount = (count: number) => setForm((current) => ({
    ...current,
    days: Array.from({ length: count }, (_, index) => current.days[index] ?? { day_number: index + 1, date: null, events: [] })
      .map((day, index) => ({ ...day, day_number: index + 1, date: null })),
  }));

  const applyExample = (example: ExampleSelection) => {
    setForm((current) => ({ ...current, days: example.days.map((day, index) => ({ ...day, day_number: index + 1, date: null })) }));
    setStep(2);
    setError(example.requires_special_diets ? "This example includes a reminder to enter any special-diet counts in step 4." : null);
  };

  const toggleEvent = (dayIndex: number, item: CatalogEvent) => setForm((current) => ({
    ...current,
    days: current.days.map((day, index) => {
      if (index !== dayIndex) return day;
      const selected = day.events.some((event) => event.catalog_id === item.id);
      return { ...day, events: selected
        ? day.events.filter((event) => event.catalog_id !== item.id)
        : [...day.events, { id: makeId(), catalog_id: item.id, custom_name: null, time_slot: item.time_of_day, guest_count: null, venue_type: null, vendor_categories: [] }] };
    }),
  }));

  const addCustomEvent = () => {
    if (customDay === null || !customName.trim()) return;
    const mapped = useMappingSuggestion ? catalog.find((item) => item.id === mappingSuggestion?.catalog_id) : undefined;
    const custom: PlanEvent = { id: makeId(), catalog_id: mapped?.id ?? null, custom_name: mapped ? null : customName.trim(), time_slot: mapped?.time_of_day ?? customSlot, guest_count: null, venue_type: null, vendor_categories: mapped ? [] : customCategories };
    setForm((current) => ({ ...current, days: current.days.map((day, index) => index === customDay ? { ...day, events: [...day.events, custom] } : day) }));
    setCustomName(""); setCustomCategories([]); setCustomDay(null); setMappingSuggestion(null); setUseMappingSuggestion(false);
  };

  const checkCustomMapping = async () => {
    if (!customName.trim()) return;
    try {
      const response = await fetch(apiUrl("/api/plan/map-custom-event"), { method: "POST", signal: beginRequest(), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: customName.trim() }) });
      const payload = await response.json();
      setMappingSuggestion(payload.suggestion ?? null); setUseMappingSuggestion(false);
    } catch { setMappingSuggestion(null); }
  };

  const validateStep = (): string | null => {
    if (step === 1 && (form.days.length < 1 || form.days.length > 5)) return "Choose between 1 and 5 days.";
    if (step === 2 && eventCount === 0) return "Choose at least one event or add your own event.";
    if (step === 3) {
      if (!form.title.trim()) return "Enter a name for the celebration.";
      if (form.guest_count < 1) return "Enter the total number of guests.";
      if (form.budget_range_min_inr < 1 || form.budget_range_max_inr < 1 || form.budget_range_min_inr > form.budget_range_max_inr) return "Enter a valid total budget range.";
      if (!form.city.trim()) return "Enter a city for vendor searches.";
      if (!form.first_event_date) return "Choose the first event date.";
    }
    if (step === 4) {
      if (form.per_plate_min_inr < 1 || form.per_plate_max_inr < 1 || form.per_plate_min_inr > form.per_plate_max_inr) return "Enter a valid per-plate budget range.";
    }
    return null;
  };

  const next = () => { const validation = validateStep(); if (validation) { setError(validation); return; } setError(null); setStep((current) => Math.min(5, current + 1)); };
  const back = () => { setError(null); setStep((current) => Math.max(1, current - 1)); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateStep();
    if (validation) { setError(validation); return; }
    const complete = form.days.every((day) => day.events.length > 0);
    if (!complete) { setError("Each celebration day needs at least one event."); setStep(2); return; }
    setIsLoading(true); setError(null);
    const payload: EventPlan = {
      ...form,
      id: makeId(),
      title: form.title.trim(),
      city: form.city.trim(),
      total_budget_cap_inr: form.budget_range_max_inr,
      days: form.days.map((day, index) => ({ ...day, day_number: index + 1, date: null, events: day.events.map((item) => ({ ...item, guest_count: item.guest_count ?? form.guest_count })) })),
      vendor_assignments: [], budget_buckets: [], tasks: [], notes: [],
    };
    try {
      const response = await fetch(apiUrl("/api/plan/build"), { method: "POST", signal: beginRequest(), headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "We could not build your plan. Check the entered values.");
      onPlanCreated(result as EventPlan); onClose(); setStep(1);
    } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError(err instanceof Error ? err.message : "We could not build your plan. Please retry."); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { if (!isOpen) cancelRequest(); }, [isOpen, cancelRequest]);
  if (!isOpen) return null;
  const field = (label: string, value: string | number, onChange: (value: string) => void, type = "text", min?: number) => (
    <label key={label} className="grid gap-1 text-sm font-medium text-ink">{label}<input className="field-control" type={type} min={min} value={value} onChange={(event) => onChange(event.target.value)} /></label>
  );

  return <Dialog open={isOpen} label="Build a celebration plan" onClose={onClose}>
    <div className="mb-5 flex items-start justify-between gap-3 border-b border-line/70 pb-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Plan your celebration</p><h2 className="mt-1 text-2xl">Build a plan</h2><p className="mt-1 text-sm text-muted">Start with the days and events. Add details as you go.</p></div>
      <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">{step} / 5</span>
    </div>
    <ol className="mb-5 grid grid-cols-5 gap-2" aria-label="Setup progress">
      {["Days", "Events", "Essentials", "Needs", "Review"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={`rounded-lg px-2 py-2 text-center text-xs ${step === index + 1 ? "bg-accent text-white" : index + 1 < step ? "bg-accent/15 text-accent" : "bg-white/50 text-muted"}`}>{label}</li>)}
    </ol>
    <p className="sr-only" aria-live="polite" aria-atomic="true">Step {step} of 5</p>
    <form onSubmit={submit} className="space-y-5">
      {step === 1 && <section className="space-y-4" aria-labelledby="days-heading">
        <h3 id="days-heading" className="text-xl">How many days is the celebration?</h3>
        <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((count) => <button key={count} type="button" aria-pressed={form.days.length === count} onClick={() => updateDayCount(count)} className={`min-h-14 rounded-xl border text-lg font-semibold focus-visible:outline ${form.days.length === count ? "border-accent bg-accent/10 text-accent" : "border-line bg-white/50"}`}>{count}</button>)}</div>
        <fieldset className="rounded-2xl border border-line/70 bg-white/40 p-4"><legend className="px-1 text-sm font-semibold">Start from an example</legend><div className="grid gap-2 sm:grid-cols-2">{examples.map((example) => <button type="button" key={example.id} onClick={() => applyExample(example)} className="min-h-11 rounded-xl border border-line/70 bg-white/70 px-3 py-2 text-left text-sm hover:border-accent">{example.title}</button>)}</div></fieldset>
      </section>}

      {step === 2 && <section className="max-h-[55vh] space-y-5 overflow-y-auto pr-1" aria-label="Choose events">
        {notice && <p className="rounded-xl bg-gold-soft p-3 text-sm text-ink">{notice}</p>}
        {form.days.map((day, dayIndex) => <fieldset key={day.day_number} className="rounded-2xl border border-line/70 bg-white/40 p-4"><legend className="px-1 font-semibold">Day {day.day_number}</legend>
          {slots.map((slot) => <div key={slot} className="mt-3"><h4 className="mb-2 text-sm font-semibold capitalize text-muted">{slot}</h4><div className="grid gap-2 sm:grid-cols-2">{catalog.filter((item) => item.time_of_day === slot).map((item) => {
            const selected = day.events.some((event) => event.catalog_id === item.id);
            return <button key={item.id} type="button" aria-pressed={selected} onClick={() => toggleEvent(dayIndex, item)} className={`rounded-xl border px-3 py-3 text-left ${selected ? "border-accent bg-accent/10" : "border-line/70 bg-white/70"}`}><span className="block font-semibold">{item.display_name}</span><span className="mt-1 block text-xs text-muted">About {item.typical_duration_minutes} min · {item.guest_count_sensitivity} guest sensitivity</span></button>;
          })}</div></div>)}
          <div className="mt-4">{customDay === dayIndex ? <div className="space-y-3 rounded-xl border border-accent/40 bg-white/65 p-3">
            {field("Your event name", customName, (value) => { setCustomName(value); setMappingSuggestion(null); setUseMappingSuggestion(false); })}
            <div><Button type="button" onClick={() => void checkCustomMapping()} disabled={!customName.trim()}>Check for a catalog match</Button>{mappingSuggestion && <label className="ml-2 inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={useMappingSuggestion} onChange={(event) => setUseMappingSuggestion(event.target.checked)} />Use {mappingSuggestion.display_name} from saved example</label>}</div>
            <label className="grid gap-1 text-sm font-medium">Time of day<select className="field-control" value={customSlot} onChange={(event) => setCustomSlot(event.target.value as TimeSlot)}>{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>
            <fieldset className="grid grid-cols-2 gap-2"><legend className="mb-2 text-sm font-semibold">Vendor needs (optional)</legend>{categories.map((category) => <label key={category} className="flex min-h-11 items-center gap-2 text-sm capitalize"><input type="checkbox" checked={customCategories.includes(category)} onChange={(event) => setCustomCategories((current) => event.target.checked ? [...current, category] : current.filter((item) => item !== category))} />{category}</label>)}</fieldset>
            <div className="flex gap-2"><Button type="button" variant="primary" onClick={addCustomEvent} disabled={!customName.trim()}>Add event</Button><Button type="button" onClick={() => setCustomDay(null)}>Cancel</Button></div>
          </div> : <Button type="button" onClick={() => { setCustomDay(dayIndex); setCustomSlot("evening"); }}><span aria-hidden="true">＋</span>Add your own event</Button>}</div>
          {!!day.events.length && <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Selected events for day ${day.day_number}`}>{day.events.map((event) => <li key={event.id} className="rounded-full bg-accent/10 px-3 py-1 text-sm">{event.custom_name || catalog.find((item) => item.id === event.catalog_id)?.display_name}</li>)}</ul>}
        </fieldset>)}
      </section>}

      {step === 3 && <section className="space-y-4"><h3 className="text-xl">Essentials</h3>
        {field("Plan name", form.title, (value) => setForm((current) => ({ ...current, title: value })))}
        <div className="grid gap-3 sm:grid-cols-2">{field("Total guests", form.guest_count || "", (value) => setForm((current) => ({ ...current, guest_count: Number(value) || 0 })), "number", 1)}{field("City", form.city, (value) => setForm((current) => ({ ...current, city: value })))}
          {field("Total budget minimum (₹)", form.budget_range_min_inr || "", (value) => setForm((current) => ({ ...current, budget_range_min_inr: Number(value) || 0 })), "number", 1)}{field("Total budget maximum (₹)", form.budget_range_max_inr || "", (value) => setForm((current) => ({ ...current, budget_range_max_inr: Number(value) || 0, total_budget_cap_inr: Number(value) || 0 })), "number", 1)}
        </div>
        {field("First event date", form.first_event_date ?? "", (value) => setForm((current) => ({ ...current, first_event_date: value || null })), "date")}
      </section>}

      {step === 4 && <section className="space-y-4"><h3 className="text-xl">Needs</h3><p className="text-sm text-muted">Diet counts and per-plate numbers come from you; the plan does not estimate them.</p>
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Special diets (guest counts)</legend>{diets.map((diet) => field(`${diet.replace("_", " ")} meals`, form.special_diets[diet] ?? 0, (value) => setForm((current) => ({ ...current, special_diets: { ...current.special_diets, [diet]: Number(value) || 0 } })), "number", 0))}</fieldset>
        <div className="grid gap-3 sm:grid-cols-2">{field("Elder members", form.elder_members, (value) => setForm((current) => ({ ...current, elder_members: Number(value) || 0 })), "number", 0)}{field("Per-plate budget minimum (₹)", form.per_plate_min_inr || "", (value) => setForm((current) => ({ ...current, per_plate_min_inr: Number(value) || 0 })), "number", 1)}{field("Per-plate budget maximum (₹)", form.per_plate_max_inr || "", (value) => setForm((current) => ({ ...current, per_plate_max_inr: Number(value) || 0 })), "number", 1)}</div>
        <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Accessibility needs</legend>{["Step-free access", "Ground-floor dining", "Accessible restroom", "Quiet/rest area", "Reserved seating"].map((need) => <label key={need} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.accessibility_needs.includes(need)} onChange={(event) => setForm((current) => ({ ...current, accessibility_needs: event.target.checked ? [...current.accessibility_needs, need] : current.accessibility_needs.filter((item) => item !== need) }))} />{need}</label>)}</fieldset>
      </section>}

      {step === 5 && <section className="space-y-4"><h3 className="text-xl">Review</h3><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/55 p-3"><h4 className="font-semibold">Celebration</h4><p>{form.title || "Plan name"} · {form.days.length} days · {form.guest_count || "—"} guests</p><p className="text-sm text-muted">{form.city || "City"} · {form.first_event_date || "Date not selected"}</p></div><div className="rounded-xl bg-white/55 p-3"><h4 className="font-semibold">Budgets you entered</h4><p>Total ₹{form.budget_range_min_inr.toLocaleString("en-IN")}–₹{form.budget_range_max_inr.toLocaleString("en-IN")}</p><p className="text-sm text-muted">Per plate ₹{form.per_plate_min_inr.toLocaleString("en-IN")}–₹{form.per_plate_max_inr.toLocaleString("en-IN")}</p></div></div>
        <div className="space-y-2">{form.days.map((day) => <div key={day.day_number} className="rounded-xl border border-line/70 bg-white/45 p-3"><h4 className="font-semibold">Day {day.day_number}</h4><ul className="list-inside list-disc text-sm">{day.events.map((event) => <li key={event.id}>{event.custom_name || catalog.find((item) => item.id === event.catalog_id)?.display_name} · {event.time_slot} · {event.guest_count ?? form.guest_count} guests</li>)}</ul></div>)}</div>
        <p className="rounded-xl bg-gold-soft p-3 text-sm">Vendor amounts are shown only when you enter per-plate budgets or quotes. Event traditions are not stored as a profile field.</p>
      </section>}

      {error && <p role="alert" aria-live="assertive" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {!error && <p className="sr-only" aria-live="polite">{notice}</p>}
      <footer className="flex flex-wrap justify-between gap-2 border-t border-line/70 pt-4"><Button type="button" onClick={step === 1 ? onClose : back}>{step === 1 ? "Cancel" : "Back"}</Button>{step < 5 ? <Button key="next-step" type="button" variant="primary" onClick={next}>Next</Button> : <Button key="build-plan" type="submit" variant="primary" disabled={isLoading}>{isLoading ? "Building plan…" : "Build plan"}</Button>}</footer>
    </form>
  </Dialog>;
};

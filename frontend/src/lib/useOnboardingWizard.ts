import type { CatalogResponse } from "../api/types";
import { useEffect, useMemo, useState } from "react";
import type { CatalogEvent, EventPlan, PlanEvent, TimeSlot, VendorCategory, ExampleSelection, MappingSuggestion } from "../api/types";
import { apiUrl, readResponse } from "../api/client";
import { useRequestController } from "./useRequestController";
import { blankPlan, makeId } from "./onboarding";

/** Own the wizard draft and requests while the component renders each step. */
export function useOnboardingWizard(isOpen: boolean, onClose: () => void, onPlanCreated: (plan: EventPlan) => void) {
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
      fetch(apiUrl("/api/plan/catalog"), { signal: controller.signal }).then((response) => readResponse<CatalogResponse>(response, "Event catalog could not be loaded.")),
      fetch(apiUrl("/api/plan/examples"), { signal: controller.signal }).then((response) => readResponse<ExampleSelection[]>(response, "Event examples could not be loaded.")),
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
      const payload = await readResponse<{ suggestion: MappingSuggestion | null }>(response, "Catalog matching is unavailable. You can still add your own event.");
      setMappingSuggestion(payload.suggestion ?? null); setUseMappingSuggestion(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMappingSuggestion(null); setError(error instanceof Error ? error.message : "Catalog matching is unavailable.");
    }
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
      const result = await readResponse<EventPlan>(response, "We could not build your plan. Check the entered values.");
      onPlanCreated(result as EventPlan); onClose(); setStep(1);
    } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError(err instanceof Error ? err.message : "We could not build your plan. Please retry."); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { if (!isOpen) cancelRequest(); }, [isOpen, cancelRequest]);
  return { form, setForm, step, catalog, examples, customDay, setCustomDay,
    customName, setCustomName, customSlot, setCustomSlot, customCategories, setCustomCategories,
    mappingSuggestion, setMappingSuggestion, useMappingSuggestion, setUseMappingSuggestion,
    isLoading, error, notice, updateDayCount, applyExample, toggleEvent, addCustomEvent,
    checkCustomMapping, next, back, submit };
}

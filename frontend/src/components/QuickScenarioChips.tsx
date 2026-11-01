import React, { useEffect, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import type { CascadeDiff, EventPlan } from "../api/types";
import { apiUrl, readResponse } from "../api/client";

interface ScenarioFixture {
  id: string;
  title: string;
  description: string;
  updated_plan: EventPlan;
  diff: CascadeDiff;
  is_saved_fixture: boolean;
}
interface Props {
  plan: EventPlan;
  onApplyFixture: (plan: EventPlan, diff: CascadeDiff) => void;
  isLoading: boolean;
}

/** Offer deterministic example changes rebuilt from the current plan. */
export const QuickScenarioChips: React.FC<Props> = ({ plan, onApplyFixture, isLoading }) => {
  const [fixtures, setFixtures] = useState<ScenarioFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(apiUrl("/api/plan/scenarios"), {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
    }).then(async (response) => {
      const result = await readResponse<ScenarioFixture[]>(response, "Saved examples are unavailable.");
      if (!controller.signal.aborted) setFixtures(result as ScenarioFixture[]);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Saved examples are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [plan]);

  return <section className="space-y-3" aria-label="Quick scenarios">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><Zap size={17} className="text-gold" />Try a quick change</h2><span className="rounded-full border border-line px-2 py-1 text-xs text-muted">Saved · rebuilt from this plan</span></div>
    {error && <p role="status" className="text-sm text-muted">{error}</p>}
    {loading && <p className="text-sm text-muted" aria-live="polite">Preparing plan examples…</p>}
    {!loading && fixtures.length === 0 && !error && <p className="text-sm text-muted">Add an event to generate examples for this plan.</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{fixtures.map((fixture) => <button key={fixture.id} type="button" disabled={isLoading} onClick={() => onApplyFixture(fixture.updated_plan, fixture.diff)} className="flex min-h-28 flex-col justify-between rounded-xl border border-line/80 bg-white/55 p-3 text-left shadow-sm transition-[transform,opacity] duration-150 hover:border-accent active:scale-[.99] disabled:opacity-50 focus-visible:outline">
      <span><span className="mb-1 flex items-center gap-1 text-xs font-semibold text-accent"><Sparkles size={13} />{fixture.is_saved_fixture ? "Saved · instant" : "Example"}</span><span className="block text-sm font-semibold">{fixture.title}</span></span><span className="mt-2 line-clamp-2 text-xs text-muted">{fixture.description}</span>
    </button>)}</div>
  </section>;
};

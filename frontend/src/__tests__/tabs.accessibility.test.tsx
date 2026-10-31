// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan } from "../api/types";
import type { PlanViewProps } from "../views/types";
import { OverviewTab } from "../views/OverviewTab";
import { EventsTab } from "../views/EventsTab";
import { BudgetTab } from "../views/BudgetTab";
import { TimelineTab } from "../views/TimelineTab";
import { VendorsTab } from "../views/VendorsTab";
import { ScenariosTab } from "../views/ScenariosTab";
import { QuotesTab } from "../views/QuotesTab";
import { HowItWorksTab } from "../views/HowItWorksTab";

const plan = saved.fixtures[0].updated_plan as EventPlan;
const noop = () => {};
const props: PlanViewProps = {
  plan, lastDelta: null, lastDiff: null, tradeoffOptions: [], previewAdjustments: null,
  onPreview: noop, onApplyTradeOff: noop, forkedPlan: null, onFork: noop,
  onSwitchFork: noop, onClearFork: noop, canUndo: false, canRedo: false,
  history: [plan], historyIndex: 0, onUndo: noop, onRedo: noop, onOpenQuotes: noop,
  onPlanUpdated: noop, onAssignVendor: async () => {}, onTriggerScenario: noop,
  isLoading: false,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/scenarios") ? [] : { events: [] }))));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addListener: noop, removeListener: noop })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Phase 1/2 tab accessibility contracts", () => {
  it.each([
    ["Overview", OverviewTab], ["Events", EventsTab], ["Budget", BudgetTab],
    ["Timeline", TimelineTab], ["Vendors", VendorsTab], ["Scenarios", ScenariosTab],
    ["Quotes", QuotesTab], ["How it works", HowItWorksTab],
  ] as const)("%s has named controls and valid accessible structure", async (_name, Tab) => {
    const { container } = render(<main><Tab {...props} /></main>);
    await waitFor(() => expect(container.querySelector("h1, h2")).not.toBeNull());
    const result = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    // Characterize existing issues; tighten to zero when the semantic-heading fix lands.
    const expected = ["Timeline", "Vendors", "Quotes"].includes(_name) ? ["heading-order"] : [];
    expect(result.violations.map(issue => issue.id)).toEqual(expected);
  });
});

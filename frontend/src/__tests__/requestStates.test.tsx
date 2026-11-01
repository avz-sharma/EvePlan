// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan } from "../api/types";
import { QuickScenarioChips } from "../components/QuickScenarioChips";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("announces loading and then the failed request without applying a fixture", async () => {
  let fail!: (error: Error) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => { fail = reject; })));
  const apply = vi.fn();
  render(<QuickScenarioChips plan={saved.fixtures[0].updated_plan as EventPlan} onApplyFixture={apply} isLoading={false} />);
  expect(screen.getByText("Preparing plan examples…").getAttribute("aria-live")).toBe("polite");
  await act(async () => { fail(new Error("Examples are offline. Please retry.")); });
  expect(screen.queryByText("Preparing plan examples…")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Examples are offline. Please retry.");
  expect(apply).not.toHaveBeenCalled();
});

it("explains an empty scenario response without offering an unusable action", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  render(<QuickScenarioChips plan={saved.fixtures[0].updated_plan as EventPlan} onApplyFixture={vi.fn()} isLoading={false} />);
  await screen.findByText("Add an event to generate examples for this plan.");
  expect(screen.queryByRole("button")).toBeNull();
});

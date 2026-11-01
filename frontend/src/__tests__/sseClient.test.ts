import { afterEach, expect, it, vi } from "vitest";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan } from "../api/types";
import { streamReplan } from "../api/sseClient";

const plan = saved.fixtures[0].updated_plan as EventPlan;
afterEach(() => vi.unstubAllGlobals());

it("preserves event ordering across chunk and UTF-8 boundaries", async () => {
  const bytes = new TextEncoder().encode('event: delta\ndata: {"source":"fallback"}\n\nevent: rationale\ndata: {"rationale":"₹ confirmed"}\n\n');
  const body = new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
    controller.close();
  } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const events: string[] = [];
  await streamReplan(plan, "+40 guests", { onDelta: () => events.push("delta"),
    onRationale: value => events.push(value.rationale), onComplete: () => events.push("complete") });
  expect(events).toEqual(["delta", "₹ confirmed", "complete"]);
});

it("cancels a replaced stream without reporting a user-facing failure", async () => {
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
  })));
  const onError = vi.fn();
  const onComplete = vi.fn();
  const request = streamReplan(plan, "+40 guests", { onError, onComplete }, controller.signal);
  controller.abort();
  await request;
  expect(onError).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

it("reports server validation errors without completing or updating the plan", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    'event: error\ndata: {"message":"Special-diet counts cannot exceed the total guest count"}\n\n',
  )));
  const onError = vi.fn();
  const onComplete = vi.fn();
  const onEngineDiff = vi.fn();
  await streamReplan(plan, "only 50 guests", { onError, onComplete, onEngineDiff });
  expect(onError).toHaveBeenCalledWith(new Error("Special-diet counts cannot exceed the total guest count"));
  expect(onComplete).not.toHaveBeenCalled();
  expect(onEngineDiff).not.toHaveBeenCalled();
});

it("uses readable HTTP error details", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Invalid guest count" }), { status: 422 })));
  const onError = vi.fn();
  await streamReplan(plan, "only 0 guests", { onError });
  expect(onError).toHaveBeenCalledWith(new Error("Invalid guest count"));
});

import { afterEach, expect, it, vi } from "vitest";
import saved from "../../../backend/app/fixtures/scenario_outputs.json";
import type { EventPlan } from "../api/types";
import { streamReplan } from "../api/sseClient";
import { readResponse } from "../api/client";

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

it("reports malformed stream data and releases the response reader", async () => {
  const response = new Response('event: delta\ndata: not-json\n\n');
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const onError = vi.fn();
  const onComplete = vi.fn();
  await streamReplan(plan, "+40 guests", { onError, onComplete });
  expect(onError).toHaveBeenCalledWith(new Error("The change response could not be read. Please retry."));
  expect(onComplete).not.toHaveBeenCalled();
  expect(response.body?.locked).toBe(false);
});

it("accepts CRLF framing and ignores comments and unknown events", async () => {
  const onRationale = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(': heartbeat\r\n\r\nevent: unknown\r\ndata: {}\r\n\r\nevent: rationale\r\ndata: {"rationale":"Confirmed"}\r\n\r\n')));
  await streamReplan(plan, "+40 guests", { onRationale });
  expect(onRationale).toHaveBeenCalledWith({ rationale: "Confirmed" });
});

it.each([
  [() => new Response("upstream unavailable", { status: 503 }), "We could not apply that change (HTTP 503). Please retry."],
  [() => new Response(null, { status: 204 }), "No response body received from SSE stream"],
  [() => new Response('event: error\ndata: {}\n\n'), "We could not apply that change."],
] as const)("reports an unusable response without completing", async (response, message) => {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  const onError = vi.fn();
  const onComplete = vi.fn();
  await streamReplan(plan, "+40 guests", { onError, onComplete });
  expect(onError).toHaveBeenCalledWith(new Error(message));
  expect(onComplete).not.toHaveBeenCalled();
});

it("reports a disconnected response and unlocks its errored stream", async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("Connection lost")); } }));
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const onError = vi.fn();
  await streamReplan(plan, "+40 guests", { onError });
  expect(onError).toHaveBeenCalledWith(new Error("Connection lost"));
  expect(response.body?.locked).toBe(false);
});

it("uses a readable fallback for structured API validation errors", async () => {
  await expect(readResponse(new Response(JSON.stringify({ detail: [{ msg: "Invalid input" }] }), { status: 422 }), "Check your input.")).rejects.toThrow("Check your input.");
});

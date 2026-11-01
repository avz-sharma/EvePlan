import type { EventPlan, SSEReplanHandlers } from "./types";
import { apiUrl } from "./client";

function dispatchEvent(block: string, handlers: SSEReplanHandlers): void {
  const lines = block.split("\n");
  const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
  const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
  if (!data) return;
  let parsed: unknown;
  try { parsed = JSON.parse(data); }
  catch { throw new Error("The change response could not be read. Please retry."); }
  if (event === "error") {
    const message = parsed && typeof parsed === "object" && "message" in parsed ? parsed.message : null;
    throw new Error(typeof message === "string" ? message : "We could not apply that change.");
  }
  // The API validates these payloads; keep the JSON boundary typed without implicit any.
  switch (event) {
    case "delta": handlers.onDelta?.(parsed as Parameters<NonNullable<SSEReplanHandlers["onDelta"]>>[0]); break;
    case "engine_diff": handlers.onEngineDiff?.(parsed as Parameters<NonNullable<SSEReplanHandlers["onEngineDiff"]>>[0]); break;
    case "rationale": handlers.onRationale?.(parsed as Parameters<NonNullable<SSEReplanHandlers["onRationale"]>>[0]); break;
  }
}

async function consumeEvents(reader: ReadableStreamDefaultReader<Uint8Array>, handlers: SSEReplanHandlers): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) dispatchEvent(block, handlers);
  }
}

/** Stream validated intent, engine effects and rationale; release the reader on every exit. */
export async function streamReplan(plan: EventPlan, userPrompt: string, handlers: SSEReplanHandlers, signal?: AbortSignal): Promise<void> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(apiUrl("/api/plan/replan/stream"), {
      signal, method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, user_prompt: userPrompt }),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail = body && typeof body === "object" && "detail" in body ? body.detail : null;
      throw new Error(typeof detail === "string" && detail || `We could not apply that change (HTTP ${response.status}). Please retry.`);
    }
    if (!response.body) throw new Error("No response body received from SSE stream");
    reader = response.body.getReader();
    await consumeEvents(reader, handlers);
    if (!signal?.aborted) handlers.onComplete?.();
  } catch (error) {
    if (!signal?.aborted) handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
  } finally {
    if (reader) {
      // A disconnected stream can reject cancellation; the lock must still be released.
      try { await reader.cancel(); } catch { /* No active operation remains to recover. */ }
      reader.releaseLock();
    }
  }
}

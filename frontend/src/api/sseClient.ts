import type { CascadeDiff, EventPlan, PlanDelta, TradeOffOption } from "./types";
import { apiUrl } from "./client";

export interface SSEReplanHandlers {
  onDelta?: (data: {
    delta: PlanDelta;
    source: string;
    degraded_mode: boolean;
    remaining_quota: number;
  }) => void;
  onEngineDiff?: (data: {
    updated_plan: EventPlan;
    diff: CascadeDiff;
    tradeoff_options: TradeOffOption[];
  }) => void;
  onRationale?: (data: {
    rationale: string;
    source: string;
    degraded_mode: boolean;
  }) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export async function streamReplan(
  plan: EventPlan,
  userPrompt: string,
  handlers: SSEReplanHandlers
): Promise<void> {
  const url = apiUrl("/api/plan/replan/stream");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan,
        user_prompt: userPrompt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SSE stream failed (HTTP ${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error("No response body received from SSE stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      // Keep unfinished segment in buffer
      buffer = lines.pop() || "";

      for (const block of lines) {
        if (!block.trim()) continue;

        let eventType = "message";
        let dataStr = "";

        const subLines = block.split("\n");
        for (const line of subLines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (eventType === "delta" && handlers.onDelta) {
            handlers.onDelta(parsed);
          } else if (eventType === "engine_diff" && handlers.onEngineDiff) {
            handlers.onEngineDiff(parsed);
          } else if (eventType === "rationale" && handlers.onRationale) {
            handlers.onRationale(parsed);
          }
        } catch (parseErr) {
          console.warn("Failed to parse SSE event data:", dataStr, parseErr);
        }
      }
    }

    handlers.onComplete?.();
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

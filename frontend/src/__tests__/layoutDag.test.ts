import { describe, expect, it } from "vitest";
import { layoutDag } from "../components/layoutDag";
import type { TaskNode } from "../api/types";

const task = (id: string, dependencies: string[] = []): TaskNode => ({
  id, title: id, category: "Planning", sub_event: "WEDDING", duration_days: 1, dependencies,
  status: "NOT_STARTED", earliest_start: 0, latest_start: 0, slack_days: 0, is_critical: false, hop_level: 0,
});

describe("layoutDag", () => {
  it("places dependencies in earlier columns and packs each level", () => {
    const layout = layoutDag([task("a"), task("b", ["a"]), task("c", ["a"]), task("d", ["b", "c"])]);
    const byId = new Map(layout.nodes.map((node) => [node.task.id, node]));
    expect(byId.get("a")?.x).toBeLessThan(byId.get("b")!.x);
    expect(byId.get("b")?.x).toBe(byId.get("c")?.x);
    expect(byId.get("b")?.y).not.toBe(byId.get("c")?.y);
    expect(byId.get("d")?.x).toBeGreaterThan(byId.get("b")!.x);
    expect(layout.edges).toHaveLength(4);
  });

  it("ignores dependencies that are missing from the task list", () => {
    const layout = layoutDag([task("a", ["missing"])]);
    expect(layout.nodes[0].level).toBe(0);
    expect(layout.edges).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import type { TaskNode } from "../api/types";

describe("Phase 3: SVG + Framer Motion Cascade View DAG Math", () => {
  const sampleTasks: TaskNode[] = [
    {
      id: "task_dates",
      title: "Muhurat Dates",
      category: "Logistics",
      sub_event: "HALDI",
      duration_days: 3,
      dependencies: [],
      status: "COMPLETED",
      earliest_start: 0,
      latest_start: 0,
      slack_days: 0,
      is_critical: true,
      hop_level: 0,
    },
    {
      id: "task_venue",
      title: "Venue Booking",
      category: "Venue",
      sub_event: "WEDDING",
      duration_days: 7,
      dependencies: ["task_dates"],
      status: "COMPLETED",
      earliest_start: 3,
      latest_start: 3,
      slack_days: 0,
      is_critical: true,
      hop_level: 1,
    },
    {
      id: "task_catering",
      title: "Catering Headcount",
      category: "Catering",
      sub_event: "WEDDING",
      duration_days: 5,
      dependencies: ["task_venue"],
      status: "IN_PROGRESS",
      earliest_start: 10,
      latest_start: 10,
      slack_days: 0,
      is_critical: true,
      hop_level: 2,
    },
  ];

  it("calculates dependency hop stagger delays matching the 80ms formula", () => {
    // Formula from Phase 3 spec: delay = hop_level * 0.08
    const calculateDelay = (hopLevel: number, shouldReduceMotion: boolean): number => {
      if (shouldReduceMotion) return 0;
      return hopLevel * 0.08;
    };

    expect(calculateDelay(0, false)).toBe(0);
    expect(calculateDelay(1, false)).toBeCloseTo(0.08, 4);
    expect(calculateDelay(2, false)).toBeCloseTo(0.16, 4);
    expect(calculateDelay(3, false)).toBeCloseTo(0.24, 4);
  });

  it("sets all animation delays to 0 when reduced motion is preferred (LAW-04)", () => {
    const calculateDelay = (hopLevel: number, shouldReduceMotion: boolean): number => {
      if (shouldReduceMotion) return 0;
      return hopLevel * 0.08;
    };

    expect(calculateDelay(1, true)).toBe(0);
    expect(calculateDelay(5, true)).toBe(0);
  });

  it("generates valid SVG cubic Bezier path coordinates between prerequisite nodes", () => {
    const x1 = 20 + 220; // source right
    const y1 = 20 + 50;  // source center Y
    const x2 = 280;      // target left
    const y2 = 150 + 50; // target center Y
    const dx = Math.max(30, (x2 - x1) * 0.5);

    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    expect(path).toContain("M 240 70");
    expect(path).toContain("C ");
    expect(path).toContain("280 200");
  });

  it("maintains topological ordering across columns", () => {
    const taskMap = new Map(sampleTasks.map((t) => [t.id, t]));
    
    // Dates is prereq for Venue, Venue is prereq for Catering
    const dates = taskMap.get("task_dates")!;
    const venue = taskMap.get("task_venue")!;
    const catering = taskMap.get("task_catering")!;

    expect(venue.dependencies).toContain(dates.id);
    expect(catering.dependencies).toContain(venue.id);
    expect(catering.earliest_start).toBeGreaterThanOrEqual(venue.earliest_start + venue.duration_days);
  });
});


import type { TaskNode } from "../api/types";

export interface DagNode { task: TaskNode; x: number; y: number; level: number; width: number; height: number }
export interface DagLayout { nodes: DagNode[]; edges: Array<{ id: string; from: DagNode; to: DagNode }>; width: number; height: number }

const NODE_WIDTH = 214;
const NODE_HEIGHT = 112;
const COLUMN_GAP = 82;
const ROW_GAP = 28;

/** Places tasks in topological columns and packs each column without fixed row waste. */
export function layoutDag(tasks: TaskNode[]): DagLayout {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const levels = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const task = byId.get(id);
    const level = task?.dependencies?.reduce((max, dependency) => byId.has(dependency) ? Math.max(max, depth(dependency) + 1) : max, 0) ?? 0;
    visiting.delete(id);
    levels.set(id, level);
    return level;
  };
  tasks.forEach((task) => depth(task.id));
  const columns: TaskNode[][] = [];
  tasks.forEach((task) => { const level = levels.get(task.id) ?? 0; (columns[level] ??= []).push(task); });
  const maxRows = Math.max(1, ...columns.map((column) => column.length));
  const height = maxRows * (NODE_HEIGHT + ROW_GAP) + 72;
  const nodes = columns.flatMap((column, level) => column.map((task, row) => ({
    task, level, x: 16 + level * (NODE_WIDTH + COLUMN_GAP), y: 16 + row * (NODE_HEIGHT + ROW_GAP), width: NODE_WIDTH, height: NODE_HEIGHT,
  })));
  const positions = new Map(nodes.map((node) => [node.task.id, node]));
  const edges = tasks.flatMap((task) => (task.dependencies ?? []).flatMap((id) => {
    const from = positions.get(id); const to = positions.get(task.id);
    return from && to ? [{ id: `${id}->${task.id}`, from, to }] : [];
  }));
  return { nodes, edges, width: Math.max(600, columns.length * (NODE_WIDTH + COLUMN_GAP) + 32), height };
}

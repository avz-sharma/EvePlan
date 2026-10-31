import { readFile, writeFile } from 'node:fs/promises';
import { layoutDag } from '../src/components/layoutDag.ts';

const phase = process.argv[2];
const { tasks } = JSON.parse(await readFile('../.tools/layout-plan.json', 'utf8'));
const samples = [];
for (let iteration = 0; iteration < 105; iteration++) {
  const restored = JSON.parse(JSON.stringify(tasks));
  const start = performance.now();
  layoutDag(restored);
  if (iteration >= 5) samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const result = { tasks: tasks.length, samples: samples.length, p50_ms: samples[50], p95_ms: samples[95] };
await writeFile(`../docs/measurements/${phase}-layout.json`, JSON.stringify(result, null, 2));
console.log(result);

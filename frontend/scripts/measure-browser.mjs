import { chromium } from '@playwright/test';
import { preview } from 'vite';
import lighthouse from 'lighthouse';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const phase = process.argv[2] || 'baseline';
const profiling = process.argv.includes('--profile');
const checkAxe = process.argv.includes('--axe');
const tabs = process.argv.includes('--all-tabs') ? ['overview', 'events', 'budget', 'timeline', 'vendors', 'scenarios', 'quotes', 'how-it-works'] : ['overview', 'vendors'];
const require = createRequire(import.meta.url);
const axeSource = checkAxe ? await readFile(require.resolve('axe-core/axe.min.js'), 'utf8') : '';
const folder = resolve('../docs/measurements');
await mkdir(folder, { recursive: true });
const server = await preview({ build: { outDir: profiling ? 'dist-profile' : 'dist' },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8018' } } });
const context = await chromium.launchPersistentContext(resolve('../.tools/audit-browser'), {
  channel: 'chrome', headless: true, args: ['--remote-debugging-port=9228'],
});
const page = context.pages()[0];
const saved = JSON.parse(await readFile('../backend/app/fixtures/scenario_outputs.json', 'utf8'));
const plan = saved.fixtures[0].updated_plan;
const client = new Client({ name: 'eveplan-performance', version: '1.0.0' });
try {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(plan => localStorage.setItem('eveplan_active_plan', JSON.stringify(plan)), plan);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [
    'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js',
    '--browserUrl=http://127.0.0.1:9228', '--no-usage-statistics', '--no-performance-crux',
    `--workspace=${folder}`,
  ] }));
  const pages = await client.callTool({ name: 'list_pages', arguments: {} });
  const description = pages.content.map(item => item.text || '').join('\n');
  const match = description.match(/(?:^|\n)(\d+):/);
  if (!match) throw new Error(`Cannot identify audit page: ${description}`);
  const pageId = Number(match[1]);
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: { pageId, ...args } }, undefined, { timeout: 180000 });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result;
  };
  if (profiling) {
    await call('navigate_page', { url: 'http://127.0.0.1:4178/#/timeline' });
    await page.getByLabel('Describe a change', { exact: true }).waitFor();
    await call('emulate', { cpuThrottlingRate: 4, viewport: '390x844x1,mobile,touch' });
    await page.evaluate(() => { window.__profileRecords = []; });
    await call('performance_start_trace', { reload: false, autoStop: false });
    await page.getByLabel('Describe a change', { exact: true }).fill('+40 guests');
    await page.getByRole('button', { name: 'Describe a change', exact: true }).click();
    await page.waitForFunction(target => JSON.parse(localStorage.getItem('eveplan_active_plan')).guest_count === target, plan.guest_count + 40);
    await page.getByRole('button', { name: 'Describe a change', exact: true }).waitFor();
    const trace = await call('performance_stop_trace', { filePath: `${folder}/${phase}-cascade-trace.json.gz` });
    await writeFile(`${folder}/${phase}-trace-summary.json`, JSON.stringify(trace, null, 2));
    const records = await page.evaluate(() => window.__profileRecords);
    await writeFile(`${folder}/${phase}-react-profile.json`, JSON.stringify(records, null, 2));
    console.log(JSON.stringify({ phase, react_commits: records.length, actual_duration_ms: records.map(record => record[2]) }));
  } else {
    const metrics = [];
    for (const tab of tabs) {
      await call('navigate_page', { url: `http://127.0.0.1:4178/#/${tab}` });
      await page.waitForTimeout(500);
      let violations = [];
      if (checkAxe) {
        await page.evaluate(axeSource);
        violations = await page.evaluate(async () => (await window.axe.run(document)).violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, targets: nodes.map(node => node.target) })));
      }
      const report = await lighthouse(`http://127.0.0.1:4178/#/${tab}`, {
        port: 9228, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility'],
        disableStorageReset: true, formFactor: 'mobile', throttlingMethod: 'simulate',
        throttling: { cpuSlowdownMultiplier: 4 },
      });
      await writeFile(`${folder}/${phase}-${tab}-lighthouse.json`, report.report);
      metrics.push({ tab, ...(checkAxe ? { axe_violations: violations } : {}), performance: report.lhr.categories.performance.score * 100,
        accessibility: report.lhr.categories.accessibility.score * 100,
        lcp_ms: report.lhr.audits['largest-contentful-paint'].numericValue,
        tbt_ms: report.lhr.audits['total-blocking-time'].numericValue });
      console.log(JSON.stringify(metrics.at(-1)));
    }
    await writeFile(`${folder}/${phase}-lighthouse-summary.json`, JSON.stringify(metrics, null, 2));
    if (metrics.some(entry => entry.axe_violations?.length)) process.exitCode = 1;
  }
} finally {
  await client.close();
  await context.close();
  await new Promise(done => server.httpServer.close(done));
}

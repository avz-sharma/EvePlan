import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'eveplan-local-audit', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath,
  args: ['node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js', '--headless', '--isolated', '--no-usage-statistics', '--no-performance-crux'],
}));
try {
  const list = await client.listTools();
  console.log(JSON.stringify(list.tools.filter(tool => ['navigate_page', 'performance_start_trace', 'performance_stop_trace', 'emulate'].includes(tool.name)), null, 2));
} finally { await client.close(); }

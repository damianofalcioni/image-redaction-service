import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config.js';
import { createMcpServer } from './server.js';
import { readPackageInfo } from '../packageInfo.js';

const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
const server = createMcpServer(config, await readPackageInfo());
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}

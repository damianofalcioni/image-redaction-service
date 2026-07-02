import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { blurSensitiveRegionsTool } from './toolHandlers.js';
import { blurToolInputSchema } from './toolSchemas.js';

export function createMcpServer(config, packageInfo) {
  const server = new McpServer({
    name: packageInfo.name,
    version: packageInfo.version
  });

  server.registerTool(
    'blur_sensitive_regions',
    {
      title: 'Blur sensitive image regions',
      description: 'Blurs one or more sensitive regions in an image using normalized coordinates. Input can be raw base64, a data URL, or a remote URL when enabled by configuration.',
      inputSchema: blurToolInputSchema
    },
    async (input) => blurSensitiveRegionsTool(input, config)
  );

  return server;
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  blurSensitiveRegionsBatchTool,
  blurSensitiveRegionsTool,
  convertPdfToJpegTool
} from './toolHandlers.js';
import {
  batchBlurToolInputSchema,
  blurToolInputSchema,
  pdfToJpegToolInputSchema
} from './toolSchemas.js';

export function createMcpServer(config, packageInfo) {
  const server = new McpServer({
    name: packageInfo.name,
    version: packageInfo.version
  });

  server.registerTool(
    'blur_sensitive_regions',
    {
      title: 'Blur sensitive image regions',
      description: 'Blurs one or more sensitive regions in one image using normalized coordinates.',
      inputSchema: blurToolInputSchema
    },
    async (input) => blurSensitiveRegionsTool(input, config)
  );

  server.registerTool(
    'blur_sensitive_regions_batch',
    {
      title: 'Blur sensitive regions in multiple images',
      description: 'Redacts multiple images concurrently. Each image has its own regions and processing options, and results preserve input order.',
      inputSchema: batchBlurToolInputSchema
    },
    async (input) => blurSensitiveRegionsBatchTool(input, config)
  );

  server.registerTool(
    'convert_pdf_to_jpeg',
    {
      title: 'Convert PDF pages to JPEG',
      description: 'Converts every page of a PDF document to one JPEG image per page.',
      inputSchema: pdfToJpegToolInputSchema
    },
    async (input) => convertPdfToJpegTool(input, config)
  );

  return server;
}

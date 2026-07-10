import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { createImageBuffer, createTwoPagePdf } from '../test-support/fixtures.js';

test('MCP Streamable HTTP endpoint exposes all tools', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      accept: 'application/json, text/event-stream'
    },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(
    body.result.tools.map((tool) => tool.name).sort(),
    ['blur_sensitive_regions', 'blur_sensitive_regions_batch', 'convert_pdf_to_jpeg']
  );

  await app.close();
});

test('OpenAPI document includes single, batch, and PDF endpoints', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'GET',
    url: '/openapi.yaml'
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/yaml/);
  assert.match(response.body, /^openapi: 3\.1\.0/m);
  assert.match(response.body, /\/v1\/images\/blur-sensitive-regions:/);
  assert.match(response.body, /\/v1\/images\/blur-sensitive-regions\/batch:/);
  assert.match(response.body, /\/v1\/pdfs\/to-jpeg:/);

  await app.close();
});

test('Health response advertises the new capabilities', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().capabilities, {
    singleImageRedaction: true,
    batchImageRedaction: true,
    pdfToJpeg: true
  });

  await app.close();
});


test('MCP HTTP batch tool call executes the new batch capability', async () => {
  const image = await createImageBuffer();
  const dataUrl = `data:image/jpeg;base64,${image.toString('base64')}`;
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { accept: 'application/json, text/event-stream' },
    payload: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'blur_sensitive_regions_batch',
        arguments: {
          images: [
            {
              id: 'mcp-image',
              imageSource: dataUrl,
              regions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.3 }],
              options: { outputType: 'image/png' }
            }
          ]
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.result.structuredContent.imagesProcessed, 1);
  assert.equal(body.result.structuredContent.images[0].id, 'mcp-image');
  assert.equal(body.result.content.filter((item) => item.type === 'image').length, 1);

  await app.close();
});

test('MCP HTTP PDF tool call returns one image block per page', async () => {
  const pdf = createTwoPagePdf();
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { accept: 'application/json, text/event-stream' },
    payload: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'convert_pdf_to_jpeg',
        arguments: {
          pdfSource: `data:application/pdf;base64,${pdf.toString('base64')}`,
          options: { scale: 1, quality: 80 }
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.result.structuredContent.totalPages, 2);
  assert.equal(body.result.content.filter((item) => item.type === 'image').length, 2);

  await app.close();
});

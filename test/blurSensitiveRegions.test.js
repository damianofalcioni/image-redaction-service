import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { blurSensitiveRegionsNode } from '../src/image/blurSensitiveRegions.js';

async function createImageBuffer() {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background: '#336699'
    }
  })
    .jpeg()
    .toBuffer();
}

test('blurSensitiveRegionsNode returns a data URL and metadata', async () => {
  const input = await createImageBuffer();

  const result = await blurSensitiveRegionsNode(
    input,
    [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
    { outputType: 'image/png' }
  );

  assert.match(result.image, /^data:image\/png;base64,/);
  assert.equal(result.width, 120);
  assert.equal(result.height, 80);
  assert.equal(result.regionsProcessed, 1);
  assert.ok(Buffer.isBuffer(result.buffer));
});

test('REST endpoint blurs an image data URL', async () => {
  const input = await createImageBuffer();
  const dataUrl = `data:image/jpeg;base64,${input.toString('base64')}`;
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/images/blur-sensitive-regions',
    payload: {
      imageSource: dataUrl,
      regions: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }],
      options: { outputType: 'image/webp', quality: 80 }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.image, /^data:image\/webp;base64,/);
  assert.equal(body.mimeType, 'image/webp');
  assert.equal(body.regionsProcessed, 1);

  await app.close();
});

test('REST endpoint rejects remote image URLs by default', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/images/blur-sensitive-regions',
    payload: {
      imageSource: 'https://example.com/image.jpg',
      regions: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'REMOTE_SOURCE_DISABLED');

  await app.close();
});

test('REST endpoint rejects regions outside normalized bounds', async () => {
  const input = await createImageBuffer();
  const dataUrl = `data:image/jpeg;base64,${input.toString('base64')}`;
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/images/blur-sensitive-regions',
    payload: {
      imageSource: dataUrl,
      regions: [{ x: 0.8, y: 0.8, width: 0.4, height: 0.4 }]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'INVALID_REGION');

  await app.close();
});

test('MCP tool handler returns image content and structured metadata', async () => {
  const input = await createImageBuffer();
  const dataUrl = `data:image/jpeg;base64,${input.toString('base64')}`;
  const { blurSensitiveRegionsTool } = await import('../src/mcp/toolHandlers.js');

  const result = await blurSensitiveRegionsTool(
    {
      imageSource: dataUrl,
      regions: [{ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }],
      options: { outputType: 'image/png' }
    },
    loadConfig({ LOG_LEVEL: 'silent' })
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.content[1].type, 'image');
  assert.equal(result.content[1].mimeType, 'image/png');
  assert.match(result.structuredContent.image, /^data:image\/png;base64,/);
  assert.equal(result.structuredContent.regionsProcessed, 1);
});

test('MCP Streamable HTTP endpoint exposes the tool list', async () => {
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
  assert.equal(body.result.tools[0].name, 'blur_sensitive_regions');

  await app.close();
});

test('OpenAPI document is served by the HTTP server', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'GET',
    url: '/openapi.yaml'
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/yaml/);
  assert.match(response.body, /^openapi: 3\.1\.0/m);
  assert.match(response.body, /\/v1\/images\/blur-sensitive-regions/);

  await app.close();
});

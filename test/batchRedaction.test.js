import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { blurSensitiveRegionsBatch } from '../src/image/batchRedaction.js';
import { blurSensitiveRegionsBatchTool } from '../src/mcp/toolHandlers.js';
import { createImageBuffer } from '../test-support/fixtures.js';

async function createBatchInput() {
  const first = await createImageBuffer('#112233');
  const second = await createImageBuffer('#445566');

  return [
    {
      id: 'front',
      imageSource: `data:image/jpeg;base64,${first.toString('base64')}`,
      regions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.3 }],
      options: { outputType: 'image/png', returnDataUrl: true }
    },
    {
      id: 'back',
      imageSource: `data:image/jpeg;base64,${second.toString('base64')}`,
      regions: [
        { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
        { x: 0.6, y: 0.6, width: 0.2, height: 0.2 }
      ],
      options: { outputType: 'image/webp', returnDataUrl: true }
    }
  ];
}

test('batch function processes multiple images concurrently and preserves order', async () => {
  const images = await createBatchInput();
  const result = await blurSensitiveRegionsBatch(images, { concurrency: 2 });

  assert.equal(result.imagesProcessed, 2);
  assert.equal(result.regionsProcessed, 3);
  assert.deepEqual(result.images.map((image) => image.id), ['front', 'back']);
  assert.match(result.images[0].image, /^data:image\/png;base64,/);
  assert.match(result.images[1].image, /^data:image\/webp;base64,/);
});

test('REST batch endpoint returns one result per input image', async () => {
  const images = await createBatchInput();
  const app = await buildApp(loadConfig({
    LOG_LEVEL: 'silent',
    MAX_BATCH_IMAGES: '5',
    BATCH_CONCURRENCY: '2'
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/images/blur-sensitive-regions/batch',
    payload: { images }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.imagesProcessed, 2);
  assert.equal(body.regionsProcessed, 3);
  assert.deepEqual(body.images.map((image) => image.id), ['front', 'back']);
  assert.equal(body.images[0].mimeType, 'image/png');
  assert.equal(body.images[1].mimeType, 'image/webp');

  await app.close();
});

test('REST batch endpoint enforces the configured image limit', async () => {
  const images = await createBatchInput();
  const app = await buildApp(loadConfig({
    LOG_LEVEL: 'silent',
    MAX_BATCH_IMAGES: '1'
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/images/blur-sensitive-regions/batch',
    payload: { images }
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, 'TOO_MANY_IMAGES');

  await app.close();
});

test('MCP batch tool returns multiple image content blocks', async () => {
  const images = await createBatchInput();
  const result = await blurSensitiveRegionsBatchTool(
    { images },
    loadConfig({ LOG_LEVEL: 'silent', MAX_BATCH_IMAGES: '5', BATCH_CONCURRENCY: '2' })
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.imagesProcessed, 2);
  assert.equal(result.structuredContent.regionsProcessed, 3);
  assert.equal(result.content.filter((item) => item.type === 'image').length, 2);
  assert.deepEqual(result.structuredContent.images.map((image) => image.id), ['front', 'back']);
});

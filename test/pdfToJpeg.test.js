import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { convertPdfToJpegTool } from '../src/mcp/toolHandlers.js';
import { convertPdfToJpeg } from '../src/pdf/convertPdfToJpeg.js';
import { createTwoPagePdf } from '../test-support/fixtures.js';

test('convertPdfToJpeg returns one JPEG image per PDF page', async () => {
  const result = await convertPdfToJpeg(createTwoPagePdf(), {
    scale: 1,
    quality: 80,
    returnDataUrl: true,
    maxPages: 10
  });

  assert.equal(result.totalPages, 2);
  assert.equal(result.pagesConverted, 2);
  assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2]);
  assert.ok(result.pages.every((page) => Buffer.isBuffer(page.buffer)));
  assert.ok(result.pages.every((page) => /^data:image\/jpeg;base64,/.test(page.image)));
  assert.deepEqual(result.pages.map((page) => [page.width, page.height]), [[200, 100], [200, 100]]);
});

test('REST PDF endpoint converts all pages to JPEG', async () => {
  const pdf = createTwoPagePdf();
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/pdfs/to-jpeg',
    payload: {
      pdfSource: `data:application/pdf;base64,${pdf.toString('base64')}`,
      options: {
        scale: 1,
        quality: 75,
        returnDataUrl: false
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.totalPages, 2);
  assert.equal(body.pagesConverted, 2);
  assert.equal(body.pages[0].mimeType, 'image/jpeg');
  assert.doesNotMatch(body.pages[0].image, /^data:/);
  assert.deepEqual(body.pages.map((page) => page.pageNumber), [1, 2]);

  await app.close();
});

test('REST PDF endpoint rejects non-PDF input', async () => {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/pdfs/to-jpeg',
    payload: {
      pdfSource: Buffer.from('not a pdf').toString('base64')
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'INVALID_PDF');

  await app.close();
});

test('REST PDF endpoint enforces the configured page limit', async () => {
  const pdf = createTwoPagePdf();
  const app = await buildApp(loadConfig({
    LOG_LEVEL: 'silent',
    MAX_PDF_PAGES: '1'
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/v1/pdfs/to-jpeg',
    payload: {
      pdfSource: `data:application/pdf;base64,${pdf.toString('base64')}`
    }
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, 'TOO_MANY_PDF_PAGES');

  await app.close();
});

test('MCP PDF tool returns one image content block per page', async () => {
  const pdf = createTwoPagePdf();
  const result = await convertPdfToJpegTool(
    {
      pdfSource: `data:application/pdf;base64,${pdf.toString('base64')}`,
      options: { scale: 1, returnDataUrl: true }
    },
    loadConfig({ LOG_LEVEL: 'silent' })
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.totalPages, 2);
  assert.equal(result.content.filter((item) => item.type === 'image').length, 2);
  assert.deepEqual(result.structuredContent.pages.map((page) => page.pageNumber), [1, 2]);
});

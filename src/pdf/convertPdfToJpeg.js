import { Buffer } from 'node:buffer';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { ImageRedactionError } from '../image/errors.js';
import { sourceToBuffer } from '../image/sources.js';

const DEFAULT_OPTIONS = {
  quality: 90,
  scale: 2,
  returnDataUrl: true,
  inputMimeType: 'application/pdf',
  fetchHeaders: {},
  fetchTimeoutMs: 8000,
  maxInputBytes: 25 * 1024 * 1024,
  maxPages: 100,
  allowRemoteSource: false
};

function installCanvasGlobals() {
  globalThis.DOMMatrix ??= DOMMatrix;
  globalThis.ImageData ??= ImageData;
  globalThis.Path2D ??= Path2D;
}

async function loadPdfJs() {
  installCanvasGlobals();
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

function assertCondition(condition, message, code) {
  if (!condition) {
    throw new ImageRedactionError(message, 400, code);
  }
}

function validateOptions(options) {
  assertCondition(
    Number.isInteger(options.quality) && options.quality >= 1 && options.quality <= 100,
    'quality must be an integer between 1 and 100.',
    'INVALID_PDF_OPTIONS'
  );
  assertCondition(
    Number.isFinite(options.scale) && options.scale >= 0.1 && options.scale <= 4,
    'scale must be between 0.1 and 4.',
    'INVALID_PDF_OPTIONS'
  );
  assertCondition(
    typeof options.returnDataUrl === 'boolean',
    'returnDataUrl must be a boolean.',
    'INVALID_PDF_OPTIONS'
  );
}

function assertPdfSignature(buffer) {
  const signature = buffer.subarray(0, 5).toString('ascii');

  if (signature !== '%PDF-') {
    throw new ImageRedactionError('pdfSource does not contain a valid PDF document.', 400, 'INVALID_PDF');
  }
}

function assertPageLimit(totalPages, maxPages) {
  if (totalPages > maxPages) {
    throw new ImageRedactionError(
      `PDF contains too many pages. Maximum allowed page count is ${maxPages}.`,
      413,
      'TOO_MANY_PDF_PAGES'
    );
  }
}

async function renderPage(pdf, pageNumber, options) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: options.scale });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  const canvas = createCanvas(width, height);
  const canvasContext = canvas.getContext('2d');

  canvasContext.save();
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, width, height);
  canvasContext.restore();

  await page.render({
    canvasContext,
    viewport,
    background: 'white'
  }).promise;

  const outputBuffer = await canvas.encode('jpeg', options.quality);
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64}`;

  page.cleanup();

  return {
    pageNumber,
    image: options.returnDataUrl ? dataUrl : base64,
    dataUrl,
    base64,
    buffer: Buffer.from(outputBuffer),
    mimeType: 'image/jpeg',
    width,
    height
  };
}

/**
 * Convert every page of a PDF to a JPEG image.
 */
export async function convertPdfToJpeg(pdfSource, options = {}) {
  const normalizedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  validateOptions(normalizedOptions);

  const { buffer } = await sourceToBuffer(pdfSource, normalizedOptions, {
    label: 'PDF',
    remoteLabel: 'Remote PDF',
    unsupportedMessage: 'Unsupported pdfSource type.',
    remoteDisabledMessage: 'Remote PDF URLs are disabled. Set ALLOW_REMOTE_PDF_SOURCE=true to enable them.',
    remoteDisabledCode: 'REMOTE_PDF_SOURCE_DISABLED',
    fetchTimeoutCode: 'PDF_FETCH_TIMEOUT',
    fetchFailedCode: 'PDF_FETCH_FAILED',
    invalidDataUrlCode: 'INVALID_PDF_DATA_URL',
    tooLargeCode: 'PDF_TOO_LARGE'
  });

  assertPdfSignature(buffer);

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true
  });

  try {
    const pdf = await loadingTask.promise;
    assertPageLimit(pdf.numPages, normalizedOptions.maxPages);

    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      pages.push(await renderPage(pdf, pageNumber, normalizedOptions));
    }

    await pdf.destroy();

    return {
      pages,
      totalPages: pages.length,
      pagesConverted: pages.length,
      mimeType: 'image/jpeg'
    };
  } catch (error) {
    await loadingTask.destroy();

    if (error instanceof ImageRedactionError) {
      throw error;
    }

    throw new ImageRedactionError('Could not parse or render the PDF document.', 400, 'INVALID_PDF');
  }
}

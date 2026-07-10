import { Buffer } from 'node:buffer';
import { ImageRedactionError } from './errors.js';

const DEFAULT_SOURCE_CONTEXT = {
  label: 'Image',
  remoteLabel: 'Remote image',
  unsupportedMessage: 'Unsupported imageSource type.',
  remoteDisabledMessage: 'Remote image URLs are disabled. Set ALLOW_REMOTE_IMAGE_SOURCE=true to enable them.',
  remoteDisabledCode: 'REMOTE_SOURCE_DISABLED',
  fetchTimeoutCode: 'IMAGE_FETCH_TIMEOUT',
  fetchFailedCode: 'IMAGE_FETCH_FAILED',
  fetchUnavailableCode: 'FETCH_UNAVAILABLE',
  invalidDataUrlCode: 'INVALID_DATA_URL',
  tooLargeCode: 'IMAGE_TOO_LARGE'
};

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isDataUrl(value) {
  return typeof value === 'string' && /^data:/i.test(value);
}

function normalizeContentType(value, fallback) {
  if (!value) {
    return fallback;
  }

  return value.split(';')[0]?.trim().toLowerCase() || fallback;
}

function normalizeContext(context = {}) {
  return {
    ...DEFAULT_SOURCE_CONTEXT,
    ...context
  };
}

function assertSourceSize(byteLength, maxInputBytes, context, label = context.label) {
  if (byteLength > maxInputBytes) {
    throw new ImageRedactionError(
      `${label} is too large. Maximum allowed size is ${maxInputBytes} bytes.`,
      413,
      context.tooLargeCode
    );
  }
}

function assertRemoteContentLength(response, maxInputBytes, context) {
  const contentLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(contentLength)) {
    assertSourceSize(contentLength, maxInputBytes, context, context.remoteLabel);
  }
}

async function bufferFromArrayBufferWithLimit(response, maxInputBytes, context) {
  const arrayBuffer = await response.arrayBuffer();

  assertSourceSize(arrayBuffer.byteLength, maxInputBytes, context);

  return Buffer.from(arrayBuffer);
}

async function readStreamChunksWithLimit(reader, maxInputBytes, context) {
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    assertSourceSize(totalBytes, maxInputBytes, context);
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function bufferFromResponseWithLimit(response, maxInputBytes, context) {
  assertRemoteContentLength(response, maxInputBytes, context);

  const reader = response.body?.getReader?.();

  return reader
    ? readStreamChunksWithLimit(reader, maxInputBytes, context)
    : bufferFromArrayBufferWithLimit(response, maxInputBytes, context);
}

function assertRemoteFetchingAllowed(allowRemoteSource, context) {
  if (!allowRemoteSource) {
    throw new ImageRedactionError(
      context.remoteDisabledMessage,
      400,
      context.remoteDisabledCode
    );
  }
}

function assertFetchAvailable(context) {
  if (typeof fetch !== 'function') {
    throw new ImageRedactionError(
      'fetch is not available. Use a supported Node.js version or provide a fetch polyfill.',
      500,
      context.fetchUnavailableCode
    );
  }
}

function throwTimeoutError(error, fetchTimeoutMs, context) {
  if (error.name === 'AbortError') {
    throw new ImageRedactionError(
      `Remote ${context.label.toLowerCase()} fetch timed out after ${fetchTimeoutMs} ms.`,
      408,
      context.fetchTimeoutCode
    );
  }
}

async function fetchWithTimeout(source, options, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.fetchTimeoutMs);

  try {
    return await fetch(source, {
      headers: options.fetchHeaders,
      signal: controller.signal
    });
  } catch (error) {
    throwTimeoutError(error, options.fetchTimeoutMs, context);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertFetchResponseOk(response, context) {
  if (!response.ok) {
    throw new ImageRedactionError(
      `Failed to fetch ${context.label.toLowerCase()}: ${response.status} ${response.statusText}`,
      400,
      context.fetchFailedCode
    );
  }
}

async function fetchSourceToBuffer(source, options, context) {
  assertRemoteFetchingAllowed(options.allowRemoteSource, context);
  assertFetchAvailable(context);

  const response = await fetchWithTimeout(source, options, context);

  assertFetchResponseOk(response, context);

  return {
    buffer: await bufferFromResponseWithLimit(response, options.maxInputBytes, context),
    mimeType: normalizeContentType(response.headers.get('content-type'), options.inputMimeType)
  };
}

function bufferSourceToBuffer(source, options, context) {
  assertSourceSize(source.byteLength, options.maxInputBytes, context);

  return {
    buffer: source,
    mimeType: options.inputMimeType
  };
}

function dataUrlToBuffer(source, options, context) {
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);

  if (!match) {
    throw new ImageRedactionError('Invalid data URL.', 400, context.invalidDataUrlCode);
  }

  const buffer = match[2]
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'utf8');

  assertSourceSize(buffer.byteLength, options.maxInputBytes, context);

  return {
    buffer,
    mimeType: match[1] || options.inputMimeType
  };
}

function base64ToBuffer(source, options, context) {
  const buffer = Buffer.from(source.replace(/\s/g, ''), 'base64');

  assertSourceSize(buffer.byteLength, options.maxInputBytes, context);

  return {
    buffer,
    mimeType: options.inputMimeType
  };
}

export async function sourceToBuffer(source, options, sourceContext = {}) {
  const context = normalizeContext(sourceContext);

  if (Buffer.isBuffer(source)) {
    return bufferSourceToBuffer(source, options, context);
  }

  if (isHttpUrl(source)) {
    return fetchSourceToBuffer(source, options, context);
  }

  if (isDataUrl(source)) {
    return dataUrlToBuffer(source, options, context);
  }

  if (typeof source === 'string') {
    return base64ToBuffer(source, options, context);
  }

  throw new ImageRedactionError(context.unsupportedMessage, 400, 'UNSUPPORTED_SOURCE');
}

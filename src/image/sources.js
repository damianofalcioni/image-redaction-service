import { Buffer } from 'node:buffer';
import { ImageRedactionError } from './errors.js';

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

function assertImageSize(byteLength, maxInputBytes, label = 'Image') {
  if (byteLength > maxInputBytes) {
    throw new ImageRedactionError(
      `${label} is too large. Maximum allowed size is ${maxInputBytes} bytes.`,
      413,
      'IMAGE_TOO_LARGE'
    );
  }
}

function assertRemoteContentLength(response, maxInputBytes) {
  const contentLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(contentLength)) {
    assertImageSize(contentLength, maxInputBytes, 'Remote image');
  }
}

async function bufferFromArrayBufferWithLimit(response, maxInputBytes) {
  const arrayBuffer = await response.arrayBuffer();

  assertImageSize(arrayBuffer.byteLength, maxInputBytes);

  return Buffer.from(arrayBuffer);
}

async function readStreamChunksWithLimit(reader, maxInputBytes) {
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    assertImageSize(totalBytes, maxInputBytes);
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function bufferFromResponseWithLimit(response, maxInputBytes) {
  assertRemoteContentLength(response, maxInputBytes);

  const reader = response.body?.getReader?.();

  return reader
    ? readStreamChunksWithLimit(reader, maxInputBytes)
    : bufferFromArrayBufferWithLimit(response, maxInputBytes);
}

function assertRemoteFetchingAllowed(allowRemoteSource) {
  if (!allowRemoteSource) {
    throw new ImageRedactionError(
      'Remote image URLs are disabled. Set ALLOW_REMOTE_IMAGE_SOURCE=true to enable them.',
      400,
      'REMOTE_SOURCE_DISABLED'
    );
  }
}

function assertFetchAvailable() {
  if (typeof fetch !== 'function') {
    throw new ImageRedactionError(
      'fetch is not available. Use Node.js 18+ or provide a fetch polyfill.',
      500,
      'FETCH_UNAVAILABLE'
    );
  }
}

function throwTimeoutError(error, fetchTimeoutMs) {
  if (error.name === 'AbortError') {
    throw new ImageRedactionError(
      `Remote image fetch timed out after ${fetchTimeoutMs} ms.`,
      408,
      'IMAGE_FETCH_TIMEOUT'
    );
  }
}

async function fetchWithTimeout(source, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.fetchTimeoutMs);

  try {
    return await fetch(source, {
      headers: options.fetchHeaders,
      signal: controller.signal
    });
  } catch (error) {
    throwTimeoutError(error, options.fetchTimeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertFetchResponseOk(response) {
  if (!response.ok) {
    throw new ImageRedactionError(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
      400,
      'IMAGE_FETCH_FAILED'
    );
  }
}

async function fetchImageToBuffer(source, options) {
  assertRemoteFetchingAllowed(options.allowRemoteSource);
  assertFetchAvailable();

  const response = await fetchWithTimeout(source, options);

  assertFetchResponseOk(response);

  return {
    buffer: await bufferFromResponseWithLimit(response, options.maxInputBytes),
    mimeType: normalizeContentType(response.headers.get('content-type'), options.inputMimeType)
  };
}

function bufferSourceToBuffer(source, options) {
  assertImageSize(source.byteLength, options.maxInputBytes);

  return {
    buffer: source,
    mimeType: options.inputMimeType
  };
}

function dataUrlToBuffer(source, options) {
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);

  if (!match) {
    throw new ImageRedactionError('Invalid data URL.', 400, 'INVALID_DATA_URL');
  }

  const buffer = match[2]
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'utf8');

  assertImageSize(buffer.byteLength, options.maxInputBytes);

  return {
    buffer,
    mimeType: match[1] || options.inputMimeType
  };
}

function base64ToBuffer(source, options) {
  const buffer = Buffer.from(source.replace(/\s/g, ''), 'base64');

  assertImageSize(buffer.byteLength, options.maxInputBytes);

  return {
    buffer,
    mimeType: options.inputMimeType
  };
}

export async function sourceToBuffer(source, options) {
  if (Buffer.isBuffer(source)) {
    return bufferSourceToBuffer(source, options);
  }

  if (isHttpUrl(source)) {
    return fetchImageToBuffer(source, options);
  }

  if (isDataUrl(source)) {
    return dataUrlToBuffer(source, options);
  }

  if (typeof source === 'string') {
    return base64ToBuffer(source, options);
  }

  throw new ImageRedactionError('Unsupported imageSource type.', 400, 'UNSUPPORTED_IMAGE_SOURCE');
}

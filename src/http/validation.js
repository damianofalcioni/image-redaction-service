import { ImageRedactionError } from '../image/errors.js';

const ALLOWED_OUTPUT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif'
]);
const ALLOWED_FETCH_HEADER_NAMES = new Set(['authorization', 'accept', 'user-agent']);

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImageRedactionError(`${name} must be an object.`, 400, 'INVALID_REQUEST');
  }
}

function assertNumberOption(value, name) {
  if (!Number.isFinite(value)) {
    throw new ImageRedactionError(`${name} must be a finite number.`, 400, 'INVALID_OPTIONS');
  }
}

function assertBooleanOption(value, name) {
  if (typeof value !== 'boolean') {
    throw new ImageRedactionError(`${name} must be a boolean.`, 400, 'INVALID_OPTIONS');
  }
}

function assertIntegerOption(value, name) {
  if (!Number.isInteger(value)) {
    throw new ImageRedactionError(`${name} must be an integer.`, 400, 'INVALID_OPTIONS');
  }
}

function assertSupportedOutputType(value) {
  const cleanValue = String(value).toLowerCase();

  if (!ALLOWED_OUTPUT_TYPES.has(cleanValue)) {
    throw new ImageRedactionError(
      'options.outputType must be one of image/jpeg, image/png, image/webp, image/avif.',
      400,
      'INVALID_OPTIONS'
    );
  }
}

function assertAllowedFetchHeader(key, value) {
  if (!ALLOWED_FETCH_HEADER_NAMES.has(key.toLowerCase())) {
    throw new ImageRedactionError(
      `Unsupported fetch header: ${key}. Allowed headers: Authorization, Accept, User-Agent.`,
      400,
      'INVALID_FETCH_HEADERS'
    );
  }

  if (typeof value !== 'string') {
    throw new ImageRedactionError(`Header ${key} must be a string.`, 400, 'INVALID_FETCH_HEADERS');
  }
}

function pickSafeFetchHeaders(headers = {}, name = 'options.fetchHeaders') {
  assertPlainObject(headers, name);

  const safeHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    assertAllowedFetchHeader(key, value);
    safeHeaders[key] = value;
  }

  return safeHeaders;
}

function assertBlurRequestShape(body, name = 'request body') {
  assertPlainObject(body, name);

  if (typeof body.imageSource !== 'string') {
    throw new ImageRedactionError(`${name}.imageSource must be a string.`, 400, 'INVALID_IMAGE_SOURCE');
  }

  if (!Array.isArray(body.regions)) {
    throw new ImageRedactionError(`${name}.regions must be an array.`, 400, 'INVALID_REGIONS');
  }
}

function assertRegionLimit(regions, maxRegions) {
  if (regions.length > maxRegions) {
    throw new ImageRedactionError(
      `Too many regions. Maximum allowed region count is ${maxRegions}.`,
      413,
      'TOO_MANY_REGIONS'
    );
  }
}

function validateOptionalBlurOptions(options) {
  assertPlainObject(options, 'options');

  if (options.outputType !== undefined) {
    assertSupportedOutputType(options.outputType);
  }

  if (options.blurRadius !== undefined) {
    assertNumberOption(options.blurRadius, 'options.blurRadius');
  }

  if (options.quality !== undefined) {
    assertIntegerOption(options.quality, 'options.quality');
  }

  if (options.returnDataUrl !== undefined) {
    assertBooleanOption(options.returnDataUrl, 'options.returnDataUrl');
  }

  if (options.regionPaddingPixels !== undefined) {
    assertIntegerOption(options.regionPaddingPixels, 'options.regionPaddingPixels');
  }
}

function toSafeBlurOptions(options, config) {
  return {
    blurRadius: options.blurRadius ?? 14,
    outputType: options.outputType ?? 'image/jpeg',
    quality: options.quality ?? 92,
    returnDataUrl: options.returnDataUrl ?? true,
    inputMimeType: options.inputMimeType ?? 'image/jpeg',
    regionPaddingPixels: options.regionPaddingPixels ?? 0,
    fetchHeaders: options.fetchHeaders ? pickSafeFetchHeaders(options.fetchHeaders) : {},
    fetchTimeoutMs: config.fetchTimeoutMs,
    maxInputBytes: config.maxImageBytes,
    allowRemoteSource: config.allowRemoteImageSource
  };
}

function parseBlurItem(body, config, name = 'request body') {
  assertBlurRequestShape(body, name);

  const { imageSource, regions, options = {} } = body;

  assertRegionLimit(regions, config.maxRegions);
  validateOptionalBlurOptions(options);

  return {
    imageSource,
    regions,
    options: toSafeBlurOptions(options, config)
  };
}

export function parseBlurRequest(body, config) {
  return parseBlurItem(body, config);
}

export function parseBatchBlurRequest(body, config) {
  assertPlainObject(body, 'request body');

  if (!Array.isArray(body.images) || body.images.length === 0) {
    throw new ImageRedactionError('images must be a non-empty array.', 400, 'INVALID_IMAGES');
  }

  if (body.images.length > config.maxBatchImages) {
    throw new ImageRedactionError(
      `Too many images. Maximum allowed batch size is ${config.maxBatchImages}.`,
      413,
      'TOO_MANY_IMAGES'
    );
  }

  const images = body.images.map((item, index) => {
    const parsed = parseBlurItem(item, config, `images[${index}]`);

    if (item.id !== undefined && typeof item.id !== 'string') {
      throw new ImageRedactionError(`images[${index}].id must be a string.`, 400, 'INVALID_IMAGE_ID');
    }

    return {
      id: item.id,
      ...parsed
    };
  });

  return {
    images,
    options: {
      concurrency: config.batchConcurrency
    }
  };
}

function validatePdfOptions(options) {
  assertPlainObject(options, 'options');

  if (options.quality !== undefined) {
    assertIntegerOption(options.quality, 'options.quality');
  }

  if (options.scale !== undefined) {
    assertNumberOption(options.scale, 'options.scale');
  }

  if (options.returnDataUrl !== undefined) {
    assertBooleanOption(options.returnDataUrl, 'options.returnDataUrl');
  }
}

export function parsePdfToJpegRequest(body, config) {
  assertPlainObject(body, 'request body');

  if (typeof body.pdfSource !== 'string') {
    throw new ImageRedactionError('pdfSource must be a string.', 400, 'INVALID_PDF_SOURCE');
  }

  const options = body.options ?? {};
  validatePdfOptions(options);

  return {
    pdfSource: body.pdfSource,
    options: {
      quality: options.quality ?? 90,
      scale: options.scale ?? 2,
      returnDataUrl: options.returnDataUrl ?? true,
      inputMimeType: 'application/pdf',
      fetchHeaders: options.fetchHeaders ? pickSafeFetchHeaders(options.fetchHeaders) : {},
      fetchTimeoutMs: config.fetchTimeoutMs,
      maxInputBytes: config.maxPdfBytes,
      maxPages: config.maxPdfPages,
      allowRemoteSource: config.allowRemotePdfSource
    }
  };
}

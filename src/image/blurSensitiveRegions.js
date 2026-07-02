import sharp from 'sharp';
import { ImageRedactionError } from './errors.js';
import { sourceToBuffer } from './sources.js';

export { ImageRedactionError } from './errors.js';

const DEFAULT_OPTIONS = {
  blurRadius: 14,
  outputType: 'image/jpeg',
  quality: 92,
  returnDataUrl: true,
  inputMimeType: 'image/jpeg',
  regionPaddingPixels: 0,
  fetchHeaders: {},
  fetchTimeoutMs: 8000,
  maxInputBytes: 10 * 1024 * 1024,
  allowRemoteSource: true
};
const FORMAT_ENCODERS = {
  jpeg: (pipeline, quality) => pipeline.flatten({ background: '#ffffff' }).jpeg({ quality }),
  png: (pipeline) => pipeline.png(),
  webp: (pipeline, quality) => pipeline.webp({ quality }),
  avif: (pipeline, quality) => pipeline.avif({ quality })
};
const REQUIRED_REGION_FIELDS = ['x', 'y', 'width', 'height'];
const SUPPORTED_OUTPUT_FORMATS = new Set(Object.keys(FORMAT_ENCODERS));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function outputTypeToFormat(type) {
  const clean = String(type || '')
    .toLowerCase()
    .replace(/^image\//, '');

  if (clean === 'jpg') {
    return 'jpeg';
  }

  return clean;
}

function formatToMime(format) {
  const mimeTypes = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif'
  };

  return mimeTypes[format] || `image/${format}`;
}

function normalizedRegionToPixels(region, imageWidth, imageHeight, defaultPaddingPixels) {
  const padding = Math.round(region.paddingPixels ?? defaultPaddingPixels);
  const x = clamp(Math.round(region.x * imageWidth) - padding, 0, imageWidth);
  const y = clamp(Math.round(region.y * imageHeight) - padding, 0, imageHeight);
  const width = clamp(Math.round(region.width * imageWidth) + padding * 2, 0, imageWidth - x);
  const height = clamp(Math.round(region.height * imageHeight) + padding * 2, 0, imageHeight - y);

  return { x, y, width, height };
}

function isNumberBetween(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function assertCondition(condition, error) {
  if (!condition) {
    throw new ImageRedactionError(error.message, error.statusCode ?? 400, error.code);
  }
}

function assertRegionObject(region, index) {
  assertCondition(region && typeof region === 'object' && !Array.isArray(region), {
    message: `regions[${index}] must be an object.`,
    code: 'INVALID_REGION'
  });
}

function assertRequiredRegionFields(region, index) {
  for (const field of REQUIRED_REGION_FIELDS) {
    assertCondition(Number.isFinite(region[field]), {
      message: `regions[${index}].${field} must be a finite number.`,
      code: 'INVALID_REGION'
    });
  }
}

function regionOriginIsValid(region) {
  return isNumberBetween(region.x, 0, 1) && isNumberBetween(region.y, 0, 1);
}

function regionSizeIsValid(region) {
  return isNumberBetween(region.width, Number.MIN_VALUE, 1) && isNumberBetween(region.height, Number.MIN_VALUE, 1);
}

function regionFitsBounds(region) {
  return region.x + region.width <= 1 && region.y + region.height <= 1;
}

function optionalBlurRadiusIsValid(region) {
  return region.blurRadius === undefined || isNumberBetween(region.blurRadius, 0.3, 100);
}

function optionalPaddingIsValid(region) {
  return region.paddingPixels === undefined || isIntegerBetween(region.paddingPixels, 0, 500);
}

function regionError(index, suffix) {
  return {
    message: `regions[${index}]${suffix.replace('%INDEX%', index)}`,
    code: 'INVALID_REGION'
  };
}

function validateRegion(region, index) {
  assertRegionObject(region, index);
  assertRequiredRegionFields(region, index);
  assertCondition(regionOriginIsValid(region), regionError(index, '.x and regions[%INDEX%].y must be between 0 and 1.'));
  assertCondition(regionSizeIsValid(region), regionError(index, '.width and regions[%INDEX%].height must be greater than 0 and less than or equal to 1.'));
  assertCondition(regionFitsBounds(region), regionError(index, ' must fit inside the normalized image bounds.'));
  assertCondition(optionalBlurRadiusIsValid(region), regionError(index, '.blurRadius must be between 0.3 and 100.'));
  assertCondition(optionalPaddingIsValid(region), regionError(index, '.paddingPixels must be an integer between 0 and 500.'));
}

function validateRegions(regions) {
  if (!Array.isArray(regions)) {
    throw new ImageRedactionError('regions must be an array.', 400, 'INVALID_REGIONS');
  }

  regions.forEach(validateRegion);
}

function validateOptions(options) {
  const outputFormat = outputTypeToFormat(options.outputType);

  assertCondition(SUPPORTED_OUTPUT_FORMATS.has(outputFormat), {
    message: `Unsupported outputType: ${options.outputType}. Supported types: image/jpeg, image/png, image/webp, image/avif.`,
    code: 'UNSUPPORTED_OUTPUT_TYPE'
  });
  assertCondition(isNumberBetween(options.blurRadius, 0.3, 100), {
    message: 'blurRadius must be between 0.3 and 100.',
    code: 'INVALID_OPTIONS'
  });
  assertCondition(isIntegerBetween(options.quality, 1, 100), {
    message: 'quality must be an integer between 1 and 100.',
    code: 'INVALID_OPTIONS'
  });
  assertCondition(isIntegerBetween(options.regionPaddingPixels, 0, 500), {
    message: 'regionPaddingPixels must be an integer between 0 and 500.',
    code: 'INVALID_OPTIONS'
  });
  assertCondition(typeof options.returnDataUrl === 'boolean', {
    message: 'returnDataUrl must be a boolean.',
    code: 'INVALID_OPTIONS'
  });

  return outputFormat;
}

function assertImageDimensions(width, height) {
  if (!width || !height) {
    throw new ImageRedactionError('Could not determine image dimensions.', 400, 'INVALID_IMAGE');
  }
}

async function loadNormalizedImage(imageSource, options) {
  const { buffer: inputBuffer } = await sourceToBuffer(imageSource, options);
  const normalizedInputBuffer = await sharp(inputBuffer, { failOn: 'error' }).rotate().toBuffer();
  const metadata = await sharp(normalizedInputBuffer, { failOn: 'error' }).metadata();

  assertImageDimensions(metadata.width, metadata.height);

  return {
    buffer: normalizedInputBuffer,
    width: metadata.width,
    height: metadata.height
  };
}

function getBlurBounds(pixelRegion, image, radius) {
  const blurContext = Math.ceil(radius * 3);
  const left = clamp(pixelRegion.x - blurContext, 0, image.width);
  const top = clamp(pixelRegion.y - blurContext, 0, image.height);
  const right = clamp(pixelRegion.x + pixelRegion.width + blurContext, 0, image.width);
  const bottom = clamp(pixelRegion.y + pixelRegion.height + blurContext, 0, image.height);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    innerLeft: pixelRegion.x - left,
    innerTop: pixelRegion.y - top
  };
}

async function createBlurPatch(imageBuffer, pixelRegion, bounds, radius) {
  return sharp(imageBuffer, { failOn: 'error' })
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    })
    .blur(radius)
    .extract({
      left: bounds.innerLeft,
      top: bounds.innerTop,
      width: pixelRegion.width,
      height: pixelRegion.height
    })
    .toBuffer();
}

async function createComposite(region, image, options) {
  const pixelRegion = normalizedRegionToPixels(region, image.width, image.height, options.regionPaddingPixels);

  if (pixelRegion.width <= 0 || pixelRegion.height <= 0) {
    return null;
  }

  const radius = region.blurRadius ?? options.blurRadius;
  const bounds = getBlurBounds(pixelRegion, image, radius);
  const blurredPatch = await createBlurPatch(image.buffer, pixelRegion, bounds, radius);

  return {
    input: blurredPatch,
    left: pixelRegion.x,
    top: pixelRegion.y
  };
}

async function buildComposites(regions, image, options) {
  const composites = [];

  for (const region of regions) {
    const composite = await createComposite(region, image, options);

    if (composite) {
      composites.push(composite);
    }
  }

  return composites;
}

function buildOutputPipeline(imageBuffer, composites, outputFormat, quality) {
  const basePipeline = sharp(imageBuffer, { failOn: 'error' });
  const pipeline = composites.length > 0 ? basePipeline.composite(composites) : basePipeline;

  return FORMAT_ENCODERS[outputFormat](pipeline, quality);
}

async function renderOutput(imageBuffer, composites, outputFormat, options) {
  return buildOutputPipeline(imageBuffer, composites, outputFormat, options.quality).toBuffer();
}

function buildResult({ outputBuffer, image, outputFormat, options, regionsProcessed }) {
  const outputMimeType = formatToMime(outputFormat);
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:${outputMimeType};base64,${base64}`;

  return {
    image: options.returnDataUrl ? dataUrl : base64,
    dataUrl,
    base64,
    buffer: outputBuffer,
    mimeType: outputMimeType,
    outputFormat,
    width: image.width,
    height: image.height,
    regionsProcessed
  };
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...options
  };
}

/**
 * Blur sensitive regions in an image using normalized coordinates.
 *
 * imageSource can be raw base64, data URL, HTTP/HTTPS URL when allowed, or Buffer.
 * Regions use normalized coordinates from 0 to 1.
 * Returns an object that includes a data URL, raw base64, output Buffer, and metadata.
 */
export async function blurSensitiveRegionsNode(imageSource, regions, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const outputFormat = validateOptions(normalizedOptions);

  validateRegions(regions);

  const image = await loadNormalizedImage(imageSource, normalizedOptions);
  const composites = await buildComposites(regions, image, normalizedOptions);
  const outputBuffer = await renderOutput(image.buffer, composites, outputFormat, normalizedOptions);

  return buildResult({
    outputBuffer,
    image,
    outputFormat,
    options: normalizedOptions,
    regionsProcessed: composites.length
  });
}

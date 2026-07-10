import { parseBatchBlurRequest, parseBlurRequest, parsePdfToJpegRequest } from '../http/validation.js';
import { blurSensitiveRegionsBatch } from '../image/batchRedaction.js';
import { blurSensitiveRegionsNode } from '../image/blurSensitiveRegions.js';
import { ImageRedactionError } from '../image/errors.js';
import { convertPdfToJpeg } from '../pdf/convertPdfToJpeg.js';

function buildErrorContent(error) {
  const knownError = error instanceof ImageRedactionError;
  const payload = {
    error: {
      code: knownError ? error.code : 'INTERNAL_SERVER_ERROR',
      message: knownError ? error.message : 'Internal server error.'
    }
  };

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

function imageMetadata(result) {
  return {
    ...(result.id === undefined ? {} : { id: result.id }),
    mimeType: result.mimeType,
    outputFormat: result.outputFormat,
    width: result.width,
    height: result.height,
    regionsProcessed: result.regionsProcessed
  };
}

function buildSingleImageContent(result) {
  const metadata = imageMetadata(result);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(metadata, null, 2)
      },
      {
        type: 'image',
        data: result.base64,
        mimeType: result.mimeType
      }
    ],
    structuredContent: {
      image: result.image,
      ...metadata
    }
  };
}

function buildBatchImageContent(result) {
  const metadata = {
    imagesProcessed: result.imagesProcessed,
    regionsProcessed: result.regionsProcessed,
    images: result.images.map((image) => ({
      ...imageMetadata(image),
      image: image.image
    }))
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          imagesProcessed: metadata.imagesProcessed,
          regionsProcessed: metadata.regionsProcessed,
          images: metadata.images.map(({ image: _image, ...item }) => item)
        }, null, 2)
      },
      ...result.images.map((image) => ({
        type: 'image',
        data: image.base64,
        mimeType: image.mimeType
      }))
    ],
    structuredContent: metadata
  };
}

function buildPdfContent(result) {
  const metadata = {
    totalPages: result.totalPages,
    pagesConverted: result.pagesConverted,
    mimeType: result.mimeType,
    pages: result.pages.map((page) => ({
      pageNumber: page.pageNumber,
      image: page.image,
      mimeType: page.mimeType,
      width: page.width,
      height: page.height
    }))
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          totalPages: metadata.totalPages,
          pagesConverted: metadata.pagesConverted,
          mimeType: metadata.mimeType,
          pages: metadata.pages.map(({ image: _image, ...page }) => page)
        }, null, 2)
      },
      ...result.pages.map((page) => ({
        type: 'image',
        data: page.base64,
        mimeType: page.mimeType
      }))
    ],
    structuredContent: metadata
  };
}

export async function blurSensitiveRegionsTool(input, config) {
  try {
    const parsed = parseBlurRequest(input, config);
    const result = await blurSensitiveRegionsNode(parsed.imageSource, parsed.regions, parsed.options);

    return buildSingleImageContent(result);
  } catch (error) {
    return buildErrorContent(error);
  }
}

export async function blurSensitiveRegionsBatchTool(input, config) {
  try {
    const parsed = parseBatchBlurRequest(input, config);
    const result = await blurSensitiveRegionsBatch(parsed.images, parsed.options);

    return buildBatchImageContent(result);
  } catch (error) {
    return buildErrorContent(error);
  }
}

export async function convertPdfToJpegTool(input, config) {
  try {
    const parsed = parsePdfToJpegRequest(input, config);
    const result = await convertPdfToJpeg(parsed.pdfSource, parsed.options);

    return buildPdfContent(result);
  } catch (error) {
    return buildErrorContent(error);
  }
}

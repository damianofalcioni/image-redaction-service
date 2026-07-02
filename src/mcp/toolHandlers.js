import { blurSensitiveRegionsNode, ImageRedactionError } from '../image/blurSensitiveRegions.js';
import { parseBlurRequest } from '../http/validation.js';

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

function buildSuccessContent(result) {
  const metadata = {
    mimeType: result.mimeType,
    outputFormat: result.outputFormat,
    width: result.width,
    height: result.height,
    regionsProcessed: result.regionsProcessed
  };

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

export async function blurSensitiveRegionsTool(input, config) {
  try {
    const parsed = parseBlurRequest(input, config);
    const result = await blurSensitiveRegionsNode(parsed.imageSource, parsed.regions, parsed.options);

    return buildSuccessContent(result);
  } catch (error) {
    return buildErrorContent(error);
  }
}

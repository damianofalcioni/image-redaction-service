import { blurSensitiveRegionsNode } from './blurSensitiveRegions.js';
import { ImageRedactionError } from './errors.js';

function validateBatch(images, concurrency) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new ImageRedactionError('images must be a non-empty array.', 400, 'INVALID_IMAGES');
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new ImageRedactionError('concurrency must be a positive integer.', 400, 'INVALID_BATCH_OPTIONS');
  }
}

async function processWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}

/**
 * Redact multiple images concurrently while preserving request order.
 * The operation is all-or-nothing: the first processing error rejects the batch.
 */
export async function blurSensitiveRegionsBatch(images, options = {}) {
  const concurrency = options.concurrency ?? 4;
  validateBatch(images, concurrency);

  const results = await processWithConcurrency(
    images,
    concurrency,
    async (item) => {
      const result = await blurSensitiveRegionsNode(item.imageSource, item.regions, item.options);

      return {
        id: item.id,
        image: result.image,
        dataUrl: result.dataUrl,
        base64: result.base64,
        buffer: result.buffer,
        mimeType: result.mimeType,
        outputFormat: result.outputFormat,
        width: result.width,
        height: result.height,
        regionsProcessed: result.regionsProcessed
      };
    }
  );

  return {
    images: results,
    imagesProcessed: results.length,
    regionsProcessed: results.reduce((total, result) => total + result.regionsProcessed, 0)
  };
}

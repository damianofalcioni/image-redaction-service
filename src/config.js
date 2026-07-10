function booleanFromEnv(value, defaultValue = false) {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integerFromEnv(value, defaultValue) {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : defaultValue;
}


function positiveIntegerFromEnv(value, defaultValue) {
  return Math.max(1, integerFromEnv(value, defaultValue));
}

export function loadConfig(env = process.env) {
  return {
    port: integerFromEnv(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    logLevel: env.LOG_LEVEL || 'info',
    maxImageBytes: positiveIntegerFromEnv(env.MAX_IMAGE_BYTES, 10 * 1024 * 1024),
    maxRegions: positiveIntegerFromEnv(env.MAX_REGIONS, 100),
    maxBatchImages: positiveIntegerFromEnv(env.MAX_BATCH_IMAGES, 10),
    batchConcurrency: positiveIntegerFromEnv(env.BATCH_CONCURRENCY, 4),
    maxPdfBytes: positiveIntegerFromEnv(env.MAX_PDF_BYTES, 25 * 1024 * 1024),
    maxPdfPages: positiveIntegerFromEnv(env.MAX_PDF_PAGES, 100),
    fetchTimeoutMs: positiveIntegerFromEnv(env.FETCH_TIMEOUT_MS, 8000),
    allowRemoteImageSource: booleanFromEnv(env.ALLOW_REMOTE_IMAGE_SOURCE, false),
    allowRemotePdfSource: booleanFromEnv(env.ALLOW_REMOTE_PDF_SOURCE, false),
    corsOrigin: env.CORS_ORIGIN || false
  };
}

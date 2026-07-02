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

export function loadConfig(env = process.env) {
  return {
    port: integerFromEnv(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    logLevel: env.LOG_LEVEL || 'info',
    maxImageBytes: integerFromEnv(env.MAX_IMAGE_BYTES, 10 * 1024 * 1024),
    maxRegions: integerFromEnv(env.MAX_REGIONS, 100),
    fetchTimeoutMs: integerFromEnv(env.FETCH_TIMEOUT_MS, 8000),
    allowRemoteImageSource: booleanFromEnv(env.ALLOW_REMOTE_IMAGE_SOURCE, false),
    corsOrigin: env.CORS_ORIGIN || false
  };
}

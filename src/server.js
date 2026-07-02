import { readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { blurSensitiveRegionsNode, ImageRedactionError } from './image/blurSensitiveRegions.js';
import { parseBlurRequest } from './http/validation.js';
import { handleMcpHttpRequest, sendMethodNotAllowed } from './mcp/http.js';
import { readPackageInfo } from './packageInfo.js';

const OPENAPI_PATH = new URL('../openapi.yaml', import.meta.url);

function createAppInstance(config) {
  return Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        'req.body.imageSource',
        'req.body.options.fetchHeaders.authorization',
        'res.body.image',
        'res.body.base64',
        'res.body.dataUrl'
      ]
    },
    bodyLimit: config.maxImageBytes * 2
  });
}

async function registerCors(app, config) {
  if (!config.corsOrigin) return;

  await app.register(cors, {
    origin: config.corsOrigin
  });
}

function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    const isKnownError = error instanceof ImageRedactionError;
    const statusCode = error.statusCode || (isKnownError ? 400 : 500);

    request.log[statusCode >= 500 ? 'error' : 'warn']({
      err: error,
      code: error.code
    });

    reply.status(statusCode).send({
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: isKnownError ? error.message : 'Internal server error.'
      }
    });
  });
}

function registerHealthRoute(app, serviceInfo) {
  app.get('/health', async () => ({
    status: 'ok',
    version: serviceInfo.version,
    mcp: {
      transport: 'streamable-http',
      path: '/mcp'
    }
  }));
}


function registerOpenApiRoute(app) {
  app.get('/openapi.yaml', async (_request, reply) => {
    const specification = await readFile(OPENAPI_PATH, 'utf8');

    return reply
      .type('application/yaml; charset=utf-8')
      .send(specification);
  });
}

function registerMcpRoutes(app, config, serviceInfo) {
  app.post('/mcp', async (request, reply) => handleMcpHttpRequest(request, reply, config, serviceInfo));

  app.get('/mcp', async (_request, reply) => {
    sendMethodNotAllowed(reply);
  });

  app.delete('/mcp', async (_request, reply) => {
    sendMethodNotAllowed(reply);
  });
}

function registerBlurRoute(app, config) {
  app.post('/v1/images/blur-sensitive-regions', async (request) => {
    const parsed = parseBlurRequest(request.body, config);
    const result = await blurSensitiveRegionsNode(parsed.imageSource, parsed.regions, parsed.options);

    return {
      image: result.image,
      mimeType: result.mimeType,
      outputFormat: result.outputFormat,
      width: result.width,
      height: result.height,
      regionsProcessed: result.regionsProcessed
    };
  });
}

export async function buildApp(config, packageInfo) {
  const serviceInfo = packageInfo || await readPackageInfo();
  const app = createAppInstance(config);

  await registerCors(app, config);
  registerErrorHandler(app);
  registerHealthRoute(app, serviceInfo);
  registerOpenApiRoute(app);
  registerMcpRoutes(app, config, serviceInfo);
  registerBlurRoute(app, config);

  return app;
}

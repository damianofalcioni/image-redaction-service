import { readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { parseBatchBlurRequest, parseBlurRequest, parsePdfToJpegRequest } from './http/validation.js';
import { blurSensitiveRegionsBatch } from './image/batchRedaction.js';
import { blurSensitiveRegionsNode } from './image/blurSensitiveRegions.js';
import { ImageRedactionError } from './image/errors.js';
import { handleMcpHttpRequest, sendMethodNotAllowed } from './mcp/http.js';
import { readPackageInfo } from './packageInfo.js';
import { convertPdfToJpeg } from './pdf/convertPdfToJpeg.js';

const OPENAPI_PATH = new URL('../openapi.yaml', import.meta.url);

function createAppInstance(config) {
  return Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        'req.body.imageSource',
        'req.body.images[*].imageSource',
        'req.body.pdfSource',
        'req.body.options.fetchHeaders.authorization',
        'req.body.images[*].options.fetchHeaders.authorization',
        'res.body.image',
        'res.body.images[*].image',
        'res.body.pages[*].image',
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
    capabilities: {
      singleImageRedaction: true,
      batchImageRedaction: true,
      pdfToJpeg: true
    },
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

function toImageResponse(result) {
  return {
    ...(result.id === undefined ? {} : { id: result.id }),
    image: result.image,
    mimeType: result.mimeType,
    outputFormat: result.outputFormat,
    width: result.width,
    height: result.height,
    regionsProcessed: result.regionsProcessed
  };
}

function registerImageRoutes(app, config) {
  app.post('/v1/images/blur-sensitive-regions', async (request) => {
    const parsed = parseBlurRequest(request.body, config);
    const result = await blurSensitiveRegionsNode(parsed.imageSource, parsed.regions, parsed.options);

    return toImageResponse(result);
  });

  app.post(
    '/v1/images/blur-sensitive-regions/batch',
    {
      bodyLimit: config.maxImageBytes * config.maxBatchImages * 2
    },
    async (request) => {
      const parsed = parseBatchBlurRequest(request.body, config);
      const result = await blurSensitiveRegionsBatch(parsed.images, parsed.options);

      return {
        images: result.images.map(toImageResponse),
        imagesProcessed: result.imagesProcessed,
        regionsProcessed: result.regionsProcessed
      };
    }
  );
}

function registerPdfRoutes(app, config) {
  app.post(
    '/v1/pdfs/to-jpeg',
    {
      bodyLimit: config.maxPdfBytes * 2
    },
    async (request) => {
      const parsed = parsePdfToJpegRequest(request.body, config);
      const result = await convertPdfToJpeg(parsed.pdfSource, parsed.options);

      return {
        pages: result.pages.map((page) => ({
          pageNumber: page.pageNumber,
          image: page.image,
          mimeType: page.mimeType,
          width: page.width,
          height: page.height
        })),
        totalPages: result.totalPages,
        pagesConverted: result.pagesConverted,
        mimeType: result.mimeType
      };
    }
  );
}

export async function buildApp(config, packageInfo) {
  const serviceInfo = packageInfo || await readPackageInfo();
  const app = createAppInstance(config);

  await registerCors(app, config);
  registerErrorHandler(app);
  registerHealthRoute(app, serviceInfo);
  registerOpenApiRoute(app);
  registerMcpRoutes(app, config, serviceInfo);
  registerImageRoutes(app, config);
  registerPdfRoutes(app, config);

  return app;
}

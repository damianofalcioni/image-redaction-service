# AGENT.md

## Project purpose

This project exposes REST and MCP operations for:

1. redacting normalized sensitive regions in one image;
2. redacting multiple images concurrently;
3. converting every page of a PDF to a JPEG image.

The public package version is read from `package.json`; keep it aligned with `openapi.yaml`, Kubernetes labels, examples, and release documentation.

## Main implementation files

- `src/image/blurSensitiveRegions.js` — single-image normalization, blur, composition, and encoding.
- `src/image/batchRedaction.js` — bounded concurrent batch execution with stable result order.
- `src/image/sources.js` — Buffer, base64, data URL, and remote source loading with byte limits.
- `src/image/errors.js` — shared service error type.
- `src/pdf/convertPdfToJpeg.js` — PDF.js page rendering through `@napi-rs/canvas`.
- `src/http/validation.js` — shared REST and MCP request parsing and safe option normalization.
- `src/server.js` — Fastify routes, logging redaction, and response shaping.
- `src/mcp/server.js` — MCP tool registration.
- `src/mcp/toolHandlers.js` — MCP execution and content-block response construction.
- `src/mcp/toolSchemas.js` — Zod input schemas for all MCP tools.
- `src/mcp/http.js` — stateless MCP Streamable HTTP adapter.
- `src/mcp/stdio.js` — local MCP stdio entry point.
- `src/config.js` — environment configuration.
- `openapi.yaml` — REST API contract served at `/openapi.yaml`.

## Public REST contract

- `POST /v1/images/blur-sensitive-regions`
- `POST /v1/images/blur-sensitive-regions/batch`
- `POST /v1/pdfs/to-jpeg`
- `POST /mcp`
- `GET /health`
- `GET /openapi.yaml`

The batch request contains `images`, where every item has the same fields as the single-image request plus an optional string `id`. Results must preserve request order. Batch processing is all-or-nothing unless a future API version explicitly adds partial-result semantics.

The PDF endpoint returns one JPEG per page, ordered by `pageNumber`, starting at 1.

## MCP contract

Registered tools:

- `blur_sensitive_regions`
- `blur_sensitive_regions_batch`
- `convert_pdf_to_jpeg`

Keep REST parsing, MCP parsing, runtime behavior, tool schemas, and OpenAPI documentation aligned. Reuse `src/http/validation.js` for both REST and MCP rather than duplicating security rules.

MCP image-generating tools return metadata as text, generated images as MCP image content blocks, and data URL or raw-base64 payloads in `structuredContent`.

## Development rules

- Use ES modules only.
- Keep the direct functions independently importable.
- Do not add filesystem-path source loading unless explicitly requested.
- Do not log image content, PDFs, generated outputs, base64, data URLs, or authorization headers.
- Keep remote fetching guarded by separate image and PDF configuration switches.
- Restrict forwarded fetch headers to Authorization, Accept, and User-Agent.
- Preserve byte, batch, region, page, timeout, scale, quality, and concurrency limits.
- Use bounded concurrency for batch images.
- Render PDF pages sequentially unless memory-safe bounded page concurrency is deliberately introduced and tested.
- Do not require external PDF executables; the current implementation is self-contained in Node.js dependencies.
- Keep the TypeScript dev dependency pinned to `5.9.3` while `eslint-plugin-sonarjs` is incompatible with TypeScript 7's removed `SyntaxKind.FunctionType` alias.

## Commands

```bash
npm install
npm start
npm run dev
npm run mcp:stdio
npm test
npm run lint
npm run check
```

## Configuration

- `MAX_IMAGE_BYTES`
- `MAX_REGIONS`
- `MAX_BATCH_IMAGES`
- `BATCH_CONCURRENCY`
- `MAX_PDF_BYTES`
- `MAX_PDF_PAGES`
- `FETCH_TIMEOUT_MS`
- `ALLOW_REMOTE_IMAGE_SOURCE`
- `ALLOW_REMOTE_PDF_SOURCE`
- `CORS_ORIGIN`

The committed `.env` enables remote sources for local use. Kubernetes examples keep them disabled for safer deployment defaults.

## Testing expectations

Use Node's built-in `node:test` runner. Tests should cover direct functions, REST endpoints, MCP handlers, MCP HTTP discovery/calls, invalid inputs, resource limits, output ordering, output formats, and metadata.

Generate small images and PDF fixtures in memory. Keep fixtures outside the `test/` discovery directory when they do not contain tests.

## Container and Kubernetes

The Docker image must copy `package-lock.json`, source code, OpenAPI, README, and AGENT documentation. Production installation must exclude dev dependencies.

Keep these files aligned with environment additions and version changes:

- `.env`
- `k8s/configmap.yaml`
- `k8s/deployment.yaml`
- `README.md`
- `openapi.yaml`
- `.github/workflows/container.yml`

# Image Redaction Service

Node.js REST and MCP service for:

- blurring sensitive regions in one image;
- redacting multiple images concurrently;
- converting every page of a PDF document to a JPEG image.

The service uses Fastify, Sharp, PDF.js, `@napi-rs/canvas`, ES modules, Node's built-in test runner, and MCP Streamable HTTP. The same three operations are available through REST, MCP over HTTP, and MCP stdio.

## Requirements

- Node.js 20.9 or newer
- npm

## Install and run

```bash
npm install
npm start
```

The HTTP server listens on `http://localhost:3000` by default.

Development and verification commands:

```bash
npm run dev
npm test
npm run lint
npm run check
```

## REST endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health, version, and capability metadata. |
| `GET` | `/openapi.yaml` | OpenAPI 3.1 specification. |
| `POST` | `/v1/images/blur-sensitive-regions` | Redact one image. |
| `POST` | `/v1/images/blur-sensitive-regions/batch` | Redact multiple images concurrently. |
| `POST` | `/v1/pdfs/to-jpeg` | Convert every PDF page to one JPEG. |
| `POST` | `/mcp` | Stateless MCP Streamable HTTP endpoint. |

`GET /mcp` and `DELETE /mcp` return `405 Method Not Allowed` because the HTTP MCP endpoint is stateless.

## Single-image redaction

```bash
curl -sS \
  -X POST http://localhost:3000/v1/images/blur-sensitive-regions \
  -H 'Content-Type: application/json' \
  --data '{
    "imageSource": "data:image/jpeg;base64,...",
    "regions": [
      {
        "x": 0.12,
        "y": 0.18,
        "width": 0.32,
        "height": 0.12,
        "paddingPixels": 8,
        "blurRadius": 18
      }
    ],
    "options": {
      "outputType": "image/jpeg",
      "quality": 92,
      "returnDataUrl": true
    }
  }'
```

Response:

```json
{
  "image": "data:image/jpeg;base64,...",
  "mimeType": "image/jpeg",
  "outputFormat": "jpeg",
  "width": 1920,
  "height": 1080,
  "regionsProcessed": 1
}
```

## Batch image redaction

The batch endpoint accepts the same single-image request shape inside `images`. Images are processed concurrently, results preserve input order, and optional `id` values are returned unchanged. The operation is all-or-nothing: an invalid or failed image rejects the complete request.

```bash
curl -sS \
  -X POST http://localhost:3000/v1/images/blur-sensitive-regions/batch \
  -H 'Content-Type: application/json' \
  --data '{
    "images": [
      {
        "id": "front",
        "imageSource": "data:image/jpeg;base64,...",
        "regions": [
          { "x": 0.1, "y": 0.1, "width": 0.3, "height": 0.2 }
        ],
        "options": {
          "outputType": "image/png"
        }
      },
      {
        "id": "back",
        "imageSource": "data:image/jpeg;base64,...",
        "regions": [
          { "x": 0.2, "y": 0.2, "width": 0.2, "height": 0.2 },
          { "x": 0.6, "y": 0.6, "width": 0.2, "height": 0.2 }
        ]
      }
    ]
  }'
```

Response:

```json
{
  "images": [
    {
      "id": "front",
      "image": "data:image/png;base64,...",
      "mimeType": "image/png",
      "outputFormat": "png",
      "width": 1920,
      "height": 1080,
      "regionsProcessed": 1
    },
    {
      "id": "back",
      "image": "data:image/jpeg;base64,...",
      "mimeType": "image/jpeg",
      "outputFormat": "jpeg",
      "width": 1920,
      "height": 1080,
      "regionsProcessed": 2
    }
  ],
  "imagesProcessed": 2,
  "regionsProcessed": 3
}
```

Batch concurrency is controlled by `BATCH_CONCURRENCY`; clients cannot override the server-side limit.

## PDF-to-JPEG conversion

The PDF endpoint accepts raw base64, a `data:application/pdf;base64,...` URL, or an HTTP/HTTPS URL when remote PDF fetching is enabled. It returns one JPEG for every page in page order.

```bash
curl -sS \
  -X POST http://localhost:3000/v1/pdfs/to-jpeg \
  -H 'Content-Type: application/json' \
  --data '{
    "pdfSource": "data:application/pdf;base64,...",
    "options": {
      "quality": 90,
      "scale": 2,
      "returnDataUrl": true
    }
  }'
```

Response:

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "image": "data:image/jpeg;base64,...",
      "mimeType": "image/jpeg",
      "width": 1191,
      "height": 1684
    },
    {
      "pageNumber": 2,
      "image": "data:image/jpeg;base64,...",
      "mimeType": "image/jpeg",
      "width": 1191,
      "height": 1684
    }
  ],
  "totalPages": 2,
  "pagesConverted": 2,
  "mimeType": "image/jpeg"
}
```

`scale` controls raster resolution and accepts values from `0.1` to `4`. Higher values increase output dimensions, memory use, response size, and processing time.

## Image region coordinates

Regions use normalized coordinates from `0` to `1`:

```json
{
  "x": 0.1,
  "y": 0.2,
  "width": 0.3,
  "height": 0.15
}
```

For an image of `1920 × 1080`, this starts at pixel `(192, 216)` and covers `576 × 162` pixels.

## Accepted source formats

REST and MCP accept string sources:

- raw base64;
- data URLs;
- HTTP/HTTPS URLs when enabled.

The direct Node.js functions additionally accept `Buffer` inputs.

Remote fetching supports only these caller-provided headers:

- `Authorization`
- `Accept`
- `User-Agent`

Keep remote fetching disabled for public deployments unless network-level SSRF controls are also present.

## MCP

Run MCP over the same HTTP server:

```bash
npm start
```

HTTP endpoint:

```text
POST /mcp
```

Run the local stdio transport:

```bash
npm run mcp:stdio
```

Available MCP tools:

| Tool | Purpose |
|---|---|
| `blur_sensitive_regions` | Redact one image. |
| `blur_sensitive_regions_batch` | Redact multiple images concurrently. |
| `convert_pdf_to_jpeg` | Convert every PDF page to a JPEG. |

Image-producing MCP tools return:

- a text content block with metadata;
- one image content block per generated image;
- `structuredContent` containing metadata and data URL or raw-base64 image fields.

Example MCP HTTP tool discovery:

```bash
curl -sS \
  -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

## Direct Node.js usage

Single image:

```js
import { readFile } from 'node:fs/promises';
import { blurSensitiveRegionsNode } from './src/image/blurSensitiveRegions.js';

const image = await readFile('input.jpg');
const result = await blurSensitiveRegionsNode(
  image,
  [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
  { outputType: 'image/webp', quality: 90 }
);

console.log(result.image);
```

Batch:

```js
import { blurSensitiveRegionsBatch } from './src/image/batchRedaction.js';

const result = await blurSensitiveRegionsBatch(
  [
    { id: 'one', imageSource: firstBuffer, regions: firstRegions },
    { id: 'two', imageSource: secondBuffer, regions: secondRegions }
  ],
  { concurrency: 2 }
);
```

PDF:

```js
import { readFile } from 'node:fs/promises';
import { convertPdfToJpeg } from './src/pdf/convertPdfToJpeg.js';

const pdf = await readFile('document.pdf');
const result = await convertPdfToJpeg(pdf, {
  scale: 2,
  quality: 90,
  returnDataUrl: true
});

console.log(result.pages[0].image);
```

## Configuration

The committed `.env` is loaded by the npm scripts.

| Variable | `.env` value | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | HTTP bind address. |
| `LOG_LEVEL` | `info` | Fastify log level. |
| `MAX_IMAGE_BYTES` | `10485760` | Maximum decoded size of each image. |
| `MAX_REGIONS` | `100` | Maximum regions per image. |
| `MAX_BATCH_IMAGES` | `10` | Maximum images in one batch. |
| `BATCH_CONCURRENCY` | `4` | Images processed in parallel per batch. |
| `MAX_PDF_BYTES` | `26214400` | Maximum decoded PDF size. |
| `MAX_PDF_PAGES` | `100` | Maximum pages converted from one PDF. |
| `FETCH_TIMEOUT_MS` | `8000` | Remote-source fetch timeout. |
| `ALLOW_REMOTE_IMAGE_SOURCE` | `true` | Enables image URLs in the committed local configuration. |
| `ALLOW_REMOTE_PDF_SOURCE` | `true` | Enables PDF URLs in the committed local configuration. |
| `CORS_ORIGIN` | empty | Enables CORS for one configured origin. |

The Kubernetes example keeps both remote-source switches disabled.

## Docker

```bash
docker build -t image-redaction-service:0.4.0 .
docker run --rm -p 3000:3000 image-redaction-service:0.4.0
```

The image does not require external PDF utilities such as Poppler; PDF rendering is performed by PDF.js with `@napi-rs/canvas`.

## GitHub Container Registry

The workflow at `.github/workflows/container.yml` publishes:

```text
ghcr.io/<owner>/<repository>:0.4.0
ghcr.io/<owner>/<repository>:latest
```

It runs for pushes to `main`, semantic version tags, and manual workflow dispatches.

## Kubernetes

Update the image reference in `k8s/deployment.yaml`, then deploy:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl -n image-redaction rollout status deployment/image-redaction-service
```

Local port-forwarding:

```bash
kubectl -n image-redaction port-forward svc/image-redaction-service 3000:80
curl http://localhost:3000/health
```

## Testing coverage

The test suite covers:

- direct single-image, batch, and PDF functions;
- REST success and validation paths;
- batch size and PDF page limits;
- raw base64 versus data URL responses;
- MCP handlers and MCP HTTP tool discovery;
- OpenAPI and health capability contracts.

## Security and resource notes

- Image, PDF, authorization, and generated base64 payloads are redacted from logs.
- Request limits are configurable and enforced before or during processing.
- Batch redaction uses bounded concurrency.
- PDF pages are rendered sequentially to limit peak memory usage.
- Large `scale`, batch, image, or PDF limits can create large JSON responses; set production limits according to available memory and upstream proxy limits.

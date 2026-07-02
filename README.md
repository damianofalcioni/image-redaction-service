# Image Redaction Service

Small Node.js service for blurring sensitive regions in images using normalized coordinates. It exposes the same capability through a REST API, MCP Streamable HTTP on the same Fastify server, and an optional local MCP stdio server.

The project uses modern ES modules, Fastify, ESLint flat config, Node's built-in test runner, and Sharp. Sharp is kept as the image engine because there is no clearly lighter and better option for this exact server-side workload. The REST layer is intentionally minimal, and the image-processing function is isolated so another engine can be added later if install size becomes more important than speed and format support.

## Features

- Blur one or more regions in an image.
- Expose the blur operation through REST, MCP Streamable HTTP, and MCP stdio.
- Use normalized coordinates from `0` to `1`.
- Accept data URLs and raw base64 through the REST API.
- Support Buffer, base64, data URL, and HTTP/HTTPS image sources in the direct Node.js function.
- Return JPEG, PNG, WebP, or AVIF.
- Per-region blur radius and padding.
- Remote URL fetching disabled by default for safer deployments.
- ES modules only; no CommonJS.
- MCP Streamable HTTP endpoint at `/mcp` on the same HTTP server.
- OpenAPI description available in `openapi.yaml` and served at `/openapi.yaml`.
- MCP stdio server for local agent/client integrations.
- ESLint v9 flat config included as `eslint.config.js`.

## Requirements

- Node.js 20.9+
- npm

## Install

```bash
npm install
```

## Run

```bash
npm start
```

The service starts on `http://localhost:3000` by default. The npm start scripts load the included `.env` file with default values.

## Development mode

```bash
npm run dev
```

## Test and lint

```bash
npm test
npm run lint
npm run check
```

## Run the MCP endpoint on the same HTTP server

`npm start` exposes both the REST API and MCP Streamable HTTP on the same Fastify server and port. The MCP endpoint is:

```text
POST /mcp
```

Example initialize request:

```bash
curl -sS \
  -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data @examples/mcp-http-initialize.json
```

The HTTP MCP endpoint is stateless. It does not create or require an `Mcp-Session-Id`; each request creates a short-lived MCP server instance and transport. This keeps the image-redaction service simple and aligned with request/response tool calls.

`GET /mcp` and `DELETE /mcp` return `405 Method Not Allowed` because this service does not maintain long-running HTTP MCP sessions or server-sent event streams.

## Run the MCP stdio server

The stdio entry point exposes the same `blur_sensitive_regions` tool. This is the transport normally used by local MCP clients that spawn a tool server as a child process.

```bash
npm run mcp:stdio
```

Do not run this command directly in a normal terminal expecting an HTTP service. It waits for MCP JSON-RPC messages on stdin and writes protocol responses to stdout.

Example local MCP client configuration:

```json
{
  "mcpServers": {
    "image-redaction-service": {
      "command": "node",
      "args": [
        "/absolute/path/to/image-redaction-service/src/mcp/stdio.js"
      ],
      "env": {
        "MAX_IMAGE_BYTES": "10485760",
        "MAX_REGIONS": "100",
        "ALLOW_REMOTE_IMAGE_SOURCE": "false"
      }
    }
  }
}
```

The same example is available in `examples/mcp-stdio-config.json`.

## Configuration

The project includes a real `.env` file with default values. The `start`, `dev`, and `mcp:stdio` npm scripts load it through Node.js `--env-file=.env`.

Available variables:

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | HTTP host. |
| `LOG_LEVEL` | `info` | Fastify log level. |
| `MAX_IMAGE_BYTES` | `10485760` | Maximum decoded image input size. |
| `MAX_REGIONS` | `100` | Maximum number of blur regions per request. |
| `FETCH_TIMEOUT_MS` | `8000` | Remote image fetch timeout. |
| `ALLOW_REMOTE_IMAGE_SOURCE` | `false` | Enables HTTP/HTTPS image URLs in the REST API. |
| `CORS_ORIGIN` | empty | Enables CORS for the given origin when set. |

## OpenAPI

The REST API description is available as a static file and through the running service:

```bash
curl http://localhost:3000/openapi.yaml
```

The file is also committed at:

```text
openapi.yaml
```

## Health check

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "version": "0.3.3",
  "mcp": {
    "transport": "streamable-http",
    "path": "/mcp"
  }
}
```

## Blur sensitive regions

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


## MCP tool contract

Tool name:

```text
blur_sensitive_regions
```

Input shape:

```json
{
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
    "outputType": "image/png",
    "quality": 92,
    "returnDataUrl": true
  }
}
```

The MCP tool returns:

- a text content block with metadata,
- an image content block with the redacted image as base64,
- `structuredContent.image` containing either a data URL or raw base64 depending on `options.returnDataUrl`.

Remote image URLs remain disabled by default for MCP too, because the MCP handler uses the same configuration and safety constraints as the REST API.

## Region coordinates

Regions use normalized coordinates:

```json
{
  "x": 0.1,
  "y": 0.2,
  "width": 0.3,
  "height": 0.15
}
```

This means:

- `x`: left position divided by image width.
- `y`: top position divided by image height.
- `width`: region width divided by image width.
- `height`: region height divided by image height.

Example for a `1920 × 1080` image:

```json
{
  "x": 0.25,
  "y": 0.25,
  "width": 0.5,
  "height": 0.5
}
```

This blurs the central area from pixel `(480, 270)` with size `960 × 540`.

## Direct function usage

```js
import { readFile } from 'node:fs/promises';
import { blurSensitiveRegionsNode } from './src/image/blurSensitiveRegions.js';

const input = await readFile('input.jpg');

const result = await blurSensitiveRegionsNode(
  input,
  [
    {
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.1
    }
  ],
  {
    outputType: 'image/webp',
    quality: 90
  }
);

console.log(result.image);
```

## Remote image URLs

The direct function can process HTTP/HTTPS URLs when `allowRemoteSource` is true.

The REST service disables remote image URLs by default. To enable them:

```bash
ALLOW_REMOTE_IMAGE_SOURCE=true npm start
```

Keep this disabled on public services unless you also add network-level SSRF protections, such as blocking private IP ranges, link-local addresses, and internal DNS zones.

## Why Sharp is still used

For this operation, the service must decode images, extract regions, blur patches, composite them back, and encode the output. Sharp is heavier than pure JavaScript libraries, but it is usually faster and more suitable for production image processing.

A lighter dependency can be worse here if it increases CPU time, memory use, or output limitations. The current implementation therefore keeps Sharp and makes the rest of the stack minimal by using Fastify and no extra validation framework.

## Publish the container image to GitHub Container Registry

The repository includes a GitHub Actions workflow at:

```text
.github/workflows/container.yml
```

The workflow publishes the container image to GitHub Container Registry using the repository name as the image name:

```text
ghcr.io/<owner>/<repository>:<package-version>
ghcr.io/<owner>/<repository>:latest
```

For example, if the public repository is `damianofalcioni/image-redaction-service`, the published image for this version is:

```text
ghcr.io/damianofalcioni/image-redaction-service:0.3.3
```

The workflow runs on pushes to `main`, semantic version tags such as `v0.3.3`, and manual `workflow_dispatch` runs. It uses the built-in `GITHUB_TOKEN`, so no extra registry secret is required for publishing to the same GitHub repository package.

After the first publish, change the package visibility to public in GitHub if you want Kubernetes to pull it without an `imagePullSecret`:

```text
Repository → Packages → image-redaction-service → Package settings → Change visibility → Public
```

Update `k8s/deployment.yaml` or use Kustomize image replacement with the final image name before deploying.

## Kubernetes deployment

A ready-to-edit Kubernetes deployment is included in `k8s/`.

Build and push the container image:

```bash
docker build -t ghcr.io/YOUR_ORG/image-redaction-service:0.3.3 .
docker push ghcr.io/YOUR_ORG/image-redaction-service:0.3.3
```

Then update the image reference in `k8s/deployment.yaml` and deploy:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl -n image-redaction rollout status deployment/image-redaction-service
```

Local test through port-forwarding:

```bash
kubectl -n image-redaction port-forward svc/image-redaction-service 3000:80
curl http://localhost:3000/health
curl http://localhost:3000/openapi.yaml
```

The optional `k8s/ingress.yaml` exposes REST and MCP HTTP endpoints outside the cluster after you set your real host and ingress class.

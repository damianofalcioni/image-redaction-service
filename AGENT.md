# AGENT.md

## Project purpose

This project exposes a small REST API, an MCP Streamable HTTP endpoint, and a local MCP stdio server that blur sensitive regions in images. Regions are provided with normalized coordinates, where `x`, `y`, `width`, and `height` are numbers between `0` and `1` relative to the image dimensions.

The main implementation lives in:

- `src/image/blurSensitiveRegions.js` — coordinate conversion, patch blurring, output encoding.
- `src/image/sources.js` — image-source parsing, remote fetch handling, and input-size enforcement.
- `src/image/errors.js` — shared image-redaction error type.
- `src/server.js` — Fastify app and HTTP routes.
- `src/mcp/server.js` — MCP server factory and tool registration.
- `src/mcp/http.js` — Streamable HTTP transport adapter mounted on the Fastify server at `/mcp`.
- `src/mcp/stdio.js` — stdio transport entry point for local MCP clients.
- `src/mcp/toolHandlers.js` — MCP tool execution wrapper around the same image-redaction function.
- `src/mcp/toolSchemas.js` — Zod schemas for MCP tool inputs.
- `src/http/validation.js` — REST request validation and safe option normalization.
- `src/config.js` — environment-based runtime configuration.
- `.env` — committed default runtime environment values loaded by npm scripts.
- `openapi.yaml` — OpenAPI 3.1 REST API description, also served by the HTTP server.
- `src/packageInfo.js` — shared package-name/version reader for REST and MCP server metadata.
- `eslint.config.js` — ESLint v9 flat configuration for this ES-module project.

## Development rules

Use modern Node.js ES modules only. Do not introduce CommonJS `require`, `module.exports`, or mixed module formats.

Keep the core image function usable outside the REST service. The exported function `blurSensitiveRegionsNode(imageSource, regions, options)` must remain callable directly from another Node.js module.

Do not log image payloads, base64 strings, data URLs, authorization headers, or generated image outputs. These values may contain sensitive data.

Do not add filesystem path loading unless explicitly requested. The supported image inputs are Buffer, raw base64, data URL, and remote HTTP/HTTPS URL. The REST endpoint accepts string inputs only.

Keep remote URL fetching disabled by default in the REST service. Remote fetching is controlled by `ALLOW_REMOTE_IMAGE_SOURCE=true` because arbitrary URL fetching can create SSRF exposure.

## Commands

Install dependencies:

```bash
npm install
```

Run the service with the committed default `.env` values:

```bash
npm start
```

Run in watch mode:

```bash
npm run dev
```

Run MCP over the same HTTP server:

```bash
npm start
```

HTTP MCP endpoint:

```text
POST /mcp
```

Run MCP stdio server:

```bash
npm run mcp:stdio
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Run all checks:

```bash
npm run check
```

## MCP contract

MCP tool name:

```text
blur_sensitive_regions
```

The MCP tool accepts the same request shape as the REST endpoint. It returns metadata as text, the image as an MCP image content block, and metadata plus `image` in `structuredContent`.

For HTTP MCP, keep `/mcp` stateless unless stateful sessions are explicitly requested. The current service supports request/response tool calls and intentionally returns `405` for `GET /mcp` and `DELETE /mcp`.

For stdio MCP servers, never write logs or diagnostic messages to stdout. Stdout is reserved for MCP protocol messages. Use stderr only for fatal startup errors.

## API contract

OpenAPI endpoint:

```text
GET /openapi.yaml
```

Main endpoint:

```text
POST /v1/images/blur-sensitive-regions
```

Request body:

```json
{
  "imageSource": "data:image/jpeg;base64,...",
  "regions": [
    {
      "x": 0.1,
      "y": 0.2,
      "width": 0.3,
      "height": 0.15,
      "paddingPixels": 8,
      "blurRadius": 18
    }
  ],
  "options": {
    "blurRadius": 14,
    "outputType": "image/jpeg",
    "quality": 92,
    "returnDataUrl": true,
    "inputMimeType": "image/jpeg",
    "regionPaddingPixels": 0
  }
}
```

Response body:

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

## Image engine decision

The project currently uses Sharp. Sharp is not the smallest dependency, but for server-side image decoding, region extraction, blur, composition, and re-encoding, it is the best default choice in Node.js because it is fast, memory-conscious, and supports JPEG, PNG, WebP, and AVIF.

Do not replace Sharp with a pure JavaScript image library unless the new requirement prioritizes install size over performance and output quality. Most pure JavaScript alternatives are easier to install but slower and less suitable for production image processing.

If a future image engine is added, keep it behind a small adapter boundary and preserve the public function/API contract.

## Validation and security constraints

- Reject malformed regions before image processing.
- Preserve normalized coordinate semantics.
- Clamp pixel coordinates to image boundaries.
- Keep maximum input size enforced with `MAX_IMAGE_BYTES`.
- Keep maximum region count enforced with `MAX_REGIONS`.
- Keep fetch timeout enforced with `FETCH_TIMEOUT_MS`.
- Do not allow arbitrary request headers for remote fetches; only safe headers should pass validation.
- Do not return stack traces or internal error details to API clients.
- Keep the MCP tool, REST endpoint, and `openapi.yaml` behavior aligned. Add validation changes to both runtime paths by reusing shared code where possible, and update the OpenAPI schema when the REST contract changes.

## Testing expectations

Tests use Node's built-in `node:test` runner. Add tests for:

- Direct function usage.
- REST endpoint success.
- Invalid regions.
- Remote URL behavior.
- Output format conversion.
- MCP Streamable HTTP tool discovery through `POST /mcp`.

Keep tests deterministic. Generate small in-memory images with Sharp rather than committing binary fixtures unless a binary fixture is strictly necessary.

## GitHub Actions container publishing

The workflow file lives at `.github/workflows/container.yml`. It builds the Dockerfile/OCI image and publishes it to GitHub Container Registry as `ghcr.io/<owner>/<repository>`. The version tag is read from `package.json`, so update `package.json` before cutting a release archive.

Keep the workflow image naming repository-based unless the repository name changes. If the image name is changed, update the Kubernetes examples and README at the same time.

## Kubernetes notes

- Kubernetes manifests live in `k8s/`.
- Keep the placeholder image `ghcr.io/YOUR_ORG/image-redaction-service:<version>` out of committed production overlays; replace it with the real registry image before deployment.
- The HTTP server exposes REST and MCP over the same container port, `3000`.
- `GET /health` is used for liveness and readiness probes.
- `GET /openapi.yaml` requires `openapi.yaml` to be copied into the Docker image.
- Runtime defaults are mirrored in `k8s/configmap.yaml`; keep them aligned with `.env`.
- Keep `ALLOW_REMOTE_IMAGE_SOURCE=false` by default to avoid SSRF exposure.

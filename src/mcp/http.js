import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const MCP_INTERNAL_ERROR = {
  jsonrpc: '2.0',
  error: {
    code: -32603,
    message: 'Internal server error'
  },
  id: null
};

const METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0',
  error: {
    code: -32000,
    message: 'Method not allowed.'
  },
  id: null
};

function createStatelessTransport() {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
}


function ensureSocketCompatibility(socket) {
  if (socket && typeof socket.destroySoon !== 'function') {
    socket.destroySoon = () => {
      if (typeof socket.destroy === 'function') {
        socket.destroy();
      }
    };
  }
}

function sendJsonResponse(rawResponse, statusCode, payload) {
  if (rawResponse.headersSent) return;

  rawResponse.writeHead(statusCode, {
    'content-type': 'application/json'
  });
  rawResponse.end(JSON.stringify(payload));
}

function logMcpHttpError(request, error) {
  request.log.error({
    err: error,
    code: error.code
  });
}

export function sendMethodNotAllowed(reply) {
  reply
    .code(405)
    .header('allow', 'POST')
    .send(METHOD_NOT_ALLOWED);
}

export async function handleMcpHttpRequest(request, reply, config, packageInfo) {
  reply.hijack();

  ensureSocketCompatibility(request.raw.socket);
  ensureSocketCompatibility(reply.raw.socket);

  const server = createMcpServer(config, packageInfo);
  const transport = createStatelessTransport();

  try {
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  } catch (error) {
    logMcpHttpError(request, error);
    sendJsonResponse(reply.raw, 500, MCP_INTERNAL_ERROR);
  } finally {
    await transport.close();
    await server.close();
  }
}

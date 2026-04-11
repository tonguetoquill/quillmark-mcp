import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

function stringifyToolResult(result) {
  if (typeof result === 'string') {
    return result;
  }

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function normalizePath(urlPath) {
  return urlPath.endsWith('/') && urlPath.length > 1
    ? urlPath.slice(0, -1)
    : urlPath;
}

function normalizeToolArgs(args) {
  return args && typeof args === 'object' ? args : {};
}

// The MCP spec requires `structuredContent` to be a record (plain object).
// Arrays and primitives are not allowed, so we only attach it when the
// tool's return value is a plain object.
function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class McpSdkServerAdapter {
  constructor({ name = 'Quillmark', version = '1.0.0' } = {}) {
    this.server = new McpServer({ name, version });
    this.httpServer = null;
  }

  addTool(tool) {
    const config = {
      description: tool.description,
      inputSchema: tool.parameters,
    };

    this.server.registerTool(tool.name, config, async (args) => {
      const result = await tool.execute(normalizeToolArgs(args));

      const response = {
        content: [{ type: 'text', text: stringifyToolResult(result) }],
      };
      if (isPlainRecord(result)) {
        response.structuredContent = result;
      }
      return response;
    });
  }

  async start(startOptions) {
    const transportType = startOptions?.transportType ?? 'stdio';

    if (transportType === 'httpStream') {
      const host = startOptions.httpStream?.host ?? 'localhost';
      const port = startOptions.httpStream?.port ?? 8080;
      const endpoint = normalizePath(startOptions.httpStream?.endpoint ?? '/mcp');

      // Stateful mode: the SDK requires a session generator for a single reusable
      // transport (stateless mode forbids reuse across requests in @modelcontextprotocol/sdk >=1.29).
      // enableJsonResponse=true returns plain JSON instead of SSE streams.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      });

      await this.server.connect(transport);

      const authToken = startOptions.httpStream?.authToken;

      const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);
        if (normalizePath(url.pathname) !== endpoint) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        if (authToken) {
          const authHeader = req.headers['authorization'] ?? '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
          if (token !== authToken) {
            res.statusCode = 401;
            res.end('Unauthorized');
            return;
          }
        }

        await transport.handleRequest(req, res);
      });

      await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve();
        });
      });

      this.httpServer = httpServer;
      return;
    }

    if (transportType === 'stdio') {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      return;
    }

    throw new Error(`Unsupported transport type: ${transportType}`);
  }

  async stop() {
    if (this.httpServer) {
      await new Promise((resolve, reject) => {
        this.httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      this.httpServer = null;
    }

    await this.server.close();
  }
}

import { createServer } from 'node:http';

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

      return {
        content: [{ type: 'text', text: stringifyToolResult(result) }],
        structuredContent: result,
      };
    });
  }

  async start(startOptions) {
    const transportType = startOptions?.transportType ?? 'stdio';

    if (transportType === 'httpStream') {
      const host = startOptions.httpStream?.host ?? 'localhost';
      const port = startOptions.httpStream?.port ?? 8080;
      const endpoint = normalizePath(startOptions.httpStream?.endpoint ?? '/mcp');
      const transport = new StreamableHTTPServerTransport();

      await this.server.connect(transport);

      const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (normalizePath(url.pathname) !== endpoint) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
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

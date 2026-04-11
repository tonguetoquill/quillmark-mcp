import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

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

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
};

function normalizePath(urlPath) {
  return urlPath.endsWith('/') && urlPath.length > 1
    ? urlPath.slice(0, -1)
    : urlPath;
}

async function serveFile(res, artifactsDir, fileName) {
  // Reject any path with separators or traversal sequences — filenames only.
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const filePath = path.join(artifactsDir, fileName);
  if (!filePath.startsWith(artifactsDir + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    const ext = path.extname(fileName).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileStat.size);
    const stream = createReadStream(filePath);
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
      stream.pipe(res);
    });
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
    }
  }
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
      const artifactsDir = startOptions.httpStream?.artifactsDir
        ? path.resolve(startOptions.httpStream.artifactsDir)
        : null;
      const artifactsPath = normalizePath(startOptions.httpStream?.artifactsPath ?? '/artifacts');

      const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${host}:${port}`);
        const pathname = normalizePath(url.pathname);

        if (artifactsDir && url.pathname.startsWith(artifactsPath + '/')) {
          const fileName = url.pathname.slice(artifactsPath.length + 1);
          await serveFile(res, artifactsDir, fileName);
          return;
        }

        if (pathname !== endpoint) {
          // Return JSON 404 so MCP clients probing OAuth discovery
          // (e.g. /.well-known/oauth-protected-resource) can parse the body
          // and fall through to unauthenticated access instead of crashing.
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end('{"error":"not_found"}');
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

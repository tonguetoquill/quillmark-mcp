/**
 * @module mcp/McpSdkServerAdapter
 * Owns transport selection (stdio vs HTTP), per-request McpServer rebuild for
 * stateless HTTP, optional bearer auth, and artifact serving. Tool registration
 * is delegated to `@quillmark/mcp`'s `registerQuillmarkTools`.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerQuillmarkTools } from '@quillmark/mcp';

import { logger } from '../logger.js';
import { getErrorMessage } from '../errors.js';

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
};

function normalizePath(urlPath) {
  return urlPath.endsWith('/') && urlPath.length > 1 ? urlPath.slice(0, -1) : urlPath;
}

async function serveFile(res, artifactsDir, fileName) {
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

export class McpSdkServerAdapter {
  constructor({ name = 'Quillmark', version = '1.0.0', quiver, engine, deliver } = {}) {
    if (!quiver || !engine || typeof deliver !== 'function') {
      throw new TypeError('McpSdkServerAdapter requires { quiver, engine, deliver }.');
    }
    this.name = name;
    this.version = version;
    this.quiver = quiver;
    this.engine = engine;
    this.deliver = deliver;

    // Long-lived server for stdio mode (one process = one session).
    this.server = new McpServer({ name, version });
    registerQuillmarkTools(this.server, { quiver, engine, deliver });
    this.httpServer = null;
  }

  #buildRequestServer() {
    const server = new McpServer({ name: this.name, version: this.version });
    registerQuillmarkTools(server, {
      quiver: this.quiver,
      engine: this.engine,
      deliver: this.deliver,
    });
    return server;
  }

  async start(startOptions) {
    const transportType = startOptions?.transportType ?? 'stdio';

    if (transportType === 'httpStream') {
      const host = startOptions.httpStream?.host ?? 'localhost';
      const port = startOptions.httpStream?.port ?? 8080;
      const endpoint = normalizePath(startOptions.httpStream?.endpoint ?? '/mcp');
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

        const requestServer = this.#buildRequestServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        try {
          await requestServer.connect(transport);
          await transport.handleRequest(req, res);
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end('{"error":"internal_error"}');
          }
          logger.error(`[mcp] request handler failed: ${getErrorMessage(err)}`);
        } finally {
          await requestServer.close().catch((closeErr) => {
            logger.debug(`[mcp] request server close failed: ${getErrorMessage(closeErr)}`);
          });
        }
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
          if (error) reject(error);
          else resolve();
        });
      });
      this.httpServer = null;
    }
    await this.server.close();
  }
}

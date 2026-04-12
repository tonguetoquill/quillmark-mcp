/**
 * @module mcp/McpSdkServerAdapter
 * Adapts the MCP SDK's `McpServer` into a transport-agnostic server that
 * supports both long-lived stdio sessions and stateless HTTP request handling.
 *
 * This is the most architecturally important file in the MCP layer — it owns
 * transport selection, per-request server lifecycle, auth, and artifact serving.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { logger } from '../logger.js';

/**
 * Serialize a tool's return value into a text string for the MCP `content` field.
 *
 * Strings pass through unchanged; objects are JSON-stringified; anything else
 * is coerced via `String()`.
 *
 * @param {unknown} result - Raw return value from a tool's execute function.
 * @returns {string} Serialized text representation.
 */
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

/**
 * Strip a trailing slash from a URL path (unless it's the root `/`).
 * Ensures consistent route matching regardless of how clients format their requests.
 *
 * @param {string} urlPath - URL pathname to normalize.
 * @returns {string} Path without a trailing slash.
 */
function normalizePath(urlPath) {
  return urlPath.endsWith('/') && urlPath.length > 1
    ? urlPath.slice(0, -1)
    : urlPath;
}

/**
 * Stream a rendered artifact file to an HTTP response.
 *
 * Security: rejects any `fileName` containing path separators or `..` sequences
 * to prevent directory traversal. Additionally validates that the resolved path
 * stays within `artifactsDir` (belt-and-suspenders).
 *
 * Sets `Content-Type` from a known MIME map, `Content-Disposition: attachment`,
 * and `Content-Length` for deterministic downloads.
 *
 * @param {object} res - Node.js HTTP ServerResponse to write to.
 * @param {string} artifactsDir - Absolute path to the artifacts directory.
 * @param {string} fileName - Bare filename (no path components allowed).
 * @returns {Promise<void>}
 */
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

/**
 * Coerce tool arguments to a plain object. Guards against undefined/null/primitive
 * args that would break destructuring in tool execute handlers.
 *
 * @param {unknown} args - Raw arguments from the MCP transport.
 * @returns {Record<string, unknown>} Guaranteed plain object.
 */
function normalizeToolArgs(args) {
  return args && typeof args === 'object' ? args : {};
}

/**
 * Check whether a value is a plain object (record) suitable for the MCP
 * `structuredContent` field.
 *
 * The MCP spec requires `structuredContent` to be a record — arrays and
 * primitives are not allowed. Only attach it when the tool returns a
 * plain object.
 *
 * @param {unknown} value - Tool return value to test.
 * @returns {boolean} True if value is a non-null, non-array object.
 */
function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Wraps the MCP SDK's `McpServer` to provide a unified interface for both
 * stdio (long-lived) and HTTP stream (stateless, per-request) transports.
 *
 * Design decisions:
 * - Tools are stored in an array and re-registered on each fresh `McpServer`
 *   instance because the SDK's stateless HTTP transport cannot be reused across
 *   requests. The registry, strategy, and WASM engine live as closures on the
 *   tool execute functions, so rebuilding the McpServer is cheap.
 * - A single long-lived McpServer is kept for stdio mode (one process = one session).
 * - HTTP mode builds a fresh McpServer + transport per request, ensuring concurrent
 *   clients never collide and reconnects always succeed.
 */
export class McpSdkServerAdapter {
  /**
   * @param {object} [options]
   * @param {string} [options.name='Quillmark'] - Server name reported in MCP handshake.
   * @param {string} [options.version='1.0.0'] - Server version reported in MCP handshake.
   */
  constructor({ name = 'Quillmark', version = '1.0.0' } = {}) {
    this.name = name;
    this.version = version;
    this.tools = [];
    // A long-lived server is only used for stdio mode (one process = one session).
    // HTTP mode builds a fresh McpServer per request (stateless pattern below).
    this.server = new McpServer({ name, version });
    this.httpServer = null;
  }

  /**
   * Register a tool for MCP exposure.
   *
   * The tool is pushed to the internal array (for per-request re-registration in HTTP mode)
   * AND immediately registered on the long-lived stdio McpServer. Result wrapping
   * applies automatically: the raw return value is serialized via {@link stringifyToolResult}
   * into a text content block, and if the value is a plain record, it's also set as
   * `structuredContent` for clients that support typed responses.
   *
   * @param {object} tool - Tool definition with `name` (string), `description` (string),
   *   optional `parameters` (Zod schema), and `execute` (async function accepting args object).
   */
  addTool(tool) {
    this.tools.push(tool);
    this.#registerToolOn(this.server, tool);
  }

  #registerToolOn(mcpServer, tool) {
    const config = {
      description: tool.description,
      inputSchema: tool.parameters,
    };

    mcpServer.registerTool(tool.name, config, async (args) => {
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

  #buildRequestServer() {
    const server = new McpServer({ name: this.name, version: this.version });
    for (const tool of this.tools) {
      this.#registerToolOn(server, tool);
    }
    return server;
  }

  /**
   * Start the MCP server on the specified transport.
   *
   * Two code paths:
   *
   * **stdio** (default) — Connects the long-lived `McpServer` to a `StdioServerTransport`.
   * One process = one session; the server lives until the process exits.
   *
   * **httpStream** — Spins up an HTTP server. Each inbound request to the MCP endpoint
   * gets a fresh `McpServer` + `StreamableHTTPServerTransport` (stateless pattern).
   * Why fresh per request: the SDK forbids reusing a stateless transport across requests,
   * and concurrent clients would collide on a shared instance. Tool registration is cheap
   * because the heavyweight objects (registry, strategy, WASM engine) live as closures.
   *
   * HTTP mode also supports:
   * - Bearer token auth (checked before MCP dispatch)
   * - Artifact file serving at a configurable path with directory traversal protection
   * - JSON 404 responses for unmatched routes (helps OAuth-probing MCP clients)
   *
   * @param {object} [startOptions]
   * @param {'stdio'|'httpStream'} [startOptions.transportType='stdio'] - Transport to use.
   * @param {object} [startOptions.httpStream] - HTTP-specific options (ignored for stdio).
   * @param {string} [startOptions.httpStream.host='localhost'] - Bind address.
   * @param {number} [startOptions.httpStream.port=8080] - Listen port.
   * @param {string} [startOptions.httpStream.endpoint='/mcp'] - MCP endpoint path.
   * @param {string} [startOptions.httpStream.authToken] - Optional Bearer token for auth.
   * @param {string} [startOptions.httpStream.artifactsDir] - Absolute path to serve artifacts from.
   * @param {string} [startOptions.httpStream.artifactsPath='/artifacts'] - URL prefix for artifact serving.
   * @returns {Promise<void>}
   * @throws {Error} If transportType is not 'stdio' or 'httpStream'.
   */
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

        // Stateless pattern: the SDK forbids reusing a stateless transport
        // across requests. Build a fresh McpServer + transport per request
        // so concurrent clients never collide and reconnects always succeed.
        // Tool registration is cheap — the registry/strategy/WASM engine are
        // held as closures on the tool.execute functions and are not rebuilt.
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
          logger.error(`[mcp] request handler failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          await requestServer.close().catch((closeErr) => {
            logger.debug(`[mcp] request server close failed: ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
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

  /**
   * Gracefully shut down the server.
   *
   * Closes the HTTP server (if running in httpStream mode) and then closes
   * the long-lived McpServer. Safe to call multiple times.
   *
   * @returns {Promise<void>}
   */
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

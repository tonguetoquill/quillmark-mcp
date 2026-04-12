#!/usr/bin/env node
/**
 * @module docker/healthcheck
 * @description Docker HEALTHCHECK probe for the quillmark-mcp container.
 *
 * Sends an HTTP GET to the configured MCP endpoint and interprets the response:
 *
 * - **Exit 0 (healthy):** any HTTP status < 500. The MCP endpoint only accepts
 *   POST, so a GET returns 404 — that's fine; it proves the process is up and
 *   the listener is accepting connections.
 * - **Exit 1 (unhealthy):** status >= 500, connection refused, or timeout.
 *
 * @environment {string} [QUILLMARK_BIND=127.0.0.1:8080] - `host:port` the
 *   server is listening on. When the host portion is `0.0.0.0` (or empty),
 *   it is remapped to `127.0.0.1` so the probe connects over loopback
 *   rather than the unroutable wildcard address.
 * @environment {string} [QUILLMARK_ENDPOINT=/mcp] - HTTP path to probe.
 *
 * Timeout is hard-coded to **2 000 ms**; if the server hasn't replied by
 * then, the request is destroyed and the probe exits 1.
 */

import { request } from 'node:http';

/** @type {string} Raw `host:port` bind string from env or default. */
const bind = process.env.QUILLMARK_BIND ?? '127.0.0.1:8080';

/** @type {string} HTTP path to probe. */
const endpoint = process.env.QUILLMARK_ENDPOINT ?? '/mcp';

const lastColon = bind.lastIndexOf(':');
const rawHost = bind.slice(0, lastColon);
const port = Number.parseInt(bind.slice(lastColon + 1), 10);

/**
 * Resolve the probe target host. `0.0.0.0` and empty string are mapped to
 * `127.0.0.1` because the wildcard address is not connectable from inside
 * the same container.
 * @type {string}
 */
const host = rawHost === '0.0.0.0' || rawHost === '' ? '127.0.0.1' : rawHost;

const req = request(
  { host, port, path: endpoint, method: 'GET', timeout: 2000 },
  (res) => {
    res.resume();
    process.exit(res.statusCode && res.statusCode < 500 ? 0 : 1);
  },
);

req.on('timeout', () => {
  req.destroy(new Error('healthcheck timeout'));
});
req.on('error', () => process.exit(1));
req.end();

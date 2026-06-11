#!/usr/bin/env node
/**
 * Docker HEALTHCHECK probe: GETs the MCP endpoint; exit 0 if it answers with
 * status < 500 (a 404 to GET still proves the listener is up), exit 1 otherwise.
 */

import { request } from 'node:http';

const bind = process.env.QUILLMARK_BIND ?? '127.0.0.1:8080';
const endpoint = process.env.QUILLMARK_ENDPOINT ?? '/mcp';

const lastColon = bind.lastIndexOf(':');
const rawHost = bind.slice(0, lastColon);
const port = Number.parseInt(bind.slice(lastColon + 1), 10);

// QUILLMARK_BIND is 0.0.0.0 in the container, but the wildcard address isn't
// dialable — probe loopback instead.
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

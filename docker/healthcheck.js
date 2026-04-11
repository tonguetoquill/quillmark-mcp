#!/usr/bin/env node
// Liveness check for the quillmark-mcp container.
// Exits 0 if the HTTP server responds at all on the configured bind/port,
// exits 1 otherwise. We don't care about status code — any HTTP reply proves
// the process is up and the listener is accepting connections.

import { request } from 'node:http';

const bind = process.env.QUILLMARK_BIND ?? '127.0.0.1:8080';
const endpoint = process.env.QUILLMARK_ENDPOINT ?? '/mcp';
const lastColon = bind.lastIndexOf(':');
const rawHost = bind.slice(0, lastColon);
const port = Number.parseInt(bind.slice(lastColon + 1), 10);
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

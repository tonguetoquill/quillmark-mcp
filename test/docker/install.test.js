// Install round-trip tests. Opt-in via DOCKER_INSTALL_TEST=1.
//
// Assumes `scripts/install-mcp.sh --port $QUILLMARK_INSTALL_PORT` has already
// started a healthy stack on 127.0.0.1:$QUILLMARK_INSTALL_PORT. This suite
// only validates the external contract — it does NOT start/stop containers.
// The stop/start lifecycle is the job of scripts/test-mcp-install.sh which
// wraps this file.
//
// Single MCP client shared across `it` blocks because Streamable HTTP with
// `sessionIdGenerator` rejects a second `initialize` on the same server
// with "already initialized" (see MCP SDK 1.29).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SHOULD_RUN = process.env.DOCKER_INSTALL_TEST === '1';
const PORT = process.env.QUILLMARK_INSTALL_PORT ?? '8080';
const BASE = `http://127.0.0.1:${PORT}`;
const MCP_URL = `${BASE}/mcp`;

const maybe = SHOULD_RUN ? describe : describe.skip;

maybe('Install round-trip', () => {
  let client;

  before(async () => {
    client = new Client({ name: 'install-test', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    await client.connect(transport);
  });

  after(async () => {
    await client?.close().catch(() => {});
  });

  it('initialize handshake reports tools capability', () => {
    const info = client.getServerVersion();
    assert.ok(info?.name, 'server name missing after initialize');
    const caps = client.getServerCapabilities();
    assert.ok(caps?.tools !== undefined, 'tools capability missing');
  });

  it('tools/list returns exactly the three primitives', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.deepEqual(names, new Set(['list_quills', 'get_specs', 'create_document']));
  });

  it('create_document returns a 127.0.0.1 artifact URL, not 0.0.0.0', async () => {
    const memo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: memo },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.equal(body.status, 'success', `render failed: ${JSON.stringify(body)}`);
    assert.ok(body.url, 'no url in response');

    // The regression gate: artifact URLs MUST use 127.0.0.1, never 0.0.0.0.
    assert.ok(
      body.url.startsWith(`http://127.0.0.1:${PORT}/artifacts/`),
      `expected 127.0.0.1:${PORT} in artifact URL, got ${body.url}`,
    );
    assert.doesNotMatch(body.url, /0\.0\.0\.0/);

    // And the URL must actually be fetchable from the host.
    const res = await fetch(body.url);
    assert.equal(res.status, 200, `artifact URL ${body.url} returned ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-',
      'downloaded artifact is not a PDF');
    assert.ok(buf.length > 10 * 1024, `PDF too small (${buf.length} bytes)`);
  });

  it('/.well-known/oauth-protected-resource returns a parseable JSON 404', async () => {
    const res = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    // Phase 1 JSON 404 fallback returns {"error":"not_found"}; the key
    // guarantee is that the body parses as JSON so Claude Code's OAuth
    // probe doesn't choke.
    assert.ok(typeof body === 'object', 'oauth probe body must be a JSON object');
  });
});

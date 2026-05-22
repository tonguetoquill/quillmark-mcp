/**
 * @module test/docker/install
 *
 * Install round-trip tests -- validates the external contract of a
 * Quillmark stack launched via `scripts/install-mcp.sh`.
 *
 * Gate: opt-in via `DOCKER_INSTALL_TEST=1`. Uses the `maybe` pattern:
 * `const maybe = SHOULD_RUN ? describe : describe.skip` so the suite
 * is a no-op unless explicitly enabled. The env var
 * `QUILLMARK_INSTALL_PORT` (default `8080`) selects the port.
 *
 * Assumes a healthy stack is already running on `127.0.0.1:$PORT`.
 * This suite does NOT start/stop containers -- that lifecycle is
 * owned by `scripts/test-mcp-install.sh`, which wraps this file.
 *
 * A single MCP client is shared across `it` blocks because Streamable
 * HTTP with `sessionIdGenerator` rejects a second `initialize` on the
 * same server with "already initialized" (MCP SDK 1.29).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SHOULD_RUN = process.env.DOCKER_INSTALL_TEST === '1';
const PORT = process.env.QUILLMARK_INSTALL_PORT ?? '8080';
const BASE = `http://127.0.0.1:${PORT}`;
const MCP_URL = `${BASE}/mcp`;

/** @type {import('node:test').describe | import('node:test').describe['skip']} */
const maybe = SHOULD_RUN ? describe : describe.skip;

/**
 * Install round-trip suite. Validates the install -> exercise -> uninstall
 * cycle by probing the live MCP endpoint over Streamable HTTP.
 */
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

  /** MCP handshake: server must report a name and advertise tools capability. */
  it('initialize handshake reports tools capability', () => {
    const info = client.getServerVersion();
    assert.ok(info?.name, 'server name missing after initialize');
    const caps = client.getServerCapabilities();
    assert.ok(caps?.tools !== undefined, 'tools capability missing');
  });

  /** Tool inventory: must expose exactly `list_quills`, `get_spec`, `create_document`. */
  it('tools/list returns exactly the three primitives', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.deepEqual(names, new Set(['list_quills', 'get_spec', 'create_document']));
  });

  /**
   * Artifact URL regression gate: rendered PDF URL must use `127.0.0.1`,
   * never `0.0.0.0`. Also verifies the URL is fetchable and returns a
   * valid PDF (magic bytes + minimum size).
   */
  it('create_document returns a 127.0.0.1 artifact URL, not 0.0.0.0', async () => {
    const memo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: memo },
    });
    assert.notEqual(result.isError, true, `render failed: ${JSON.stringify(result)}`);
    const url = result.structuredContent?.url;
    assert.ok(url, 'no url in response');

    // Regression gate: artifact URLs MUST use 127.0.0.1, never 0.0.0.0.
    assert.ok(
      url.startsWith(`http://127.0.0.1:${PORT}/artifacts/`),
      `expected 127.0.0.1:${PORT} in artifact URL, got ${url}`,
    );
    assert.doesNotMatch(url, /0\.0\.0\.0/);

    const res = await fetch(url);
    assert.equal(res.status, 200, `artifact URL ${url} returned ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-',
      'downloaded artifact is not a PDF');
    assert.ok(buf.length > 10 * 1024, `PDF too small (${buf.length} bytes)`);
  });

  /**
   * OAuth probe compat: `/.well-known/oauth-protected-resource` must return
   * a JSON 404 so Claude Code's OAuth discovery doesn't choke on HTML/plaintext.
   */
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

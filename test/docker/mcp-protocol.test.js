/**
 * @module mcp-protocol
 * @description Layer 5 MCP protocol compliance tests.
 *
 * Validates that the Docker container speaks a conformant MCP dialect — not
 * just HTTP 200s, but correct JSON-RPC framing, capability negotiation,
 * tool enumeration, and tool invocation via both HTTP and stdio transports.
 *
 * Uses the official MCP SDK {@link Client} as the primary test driver (Layers
 * 5, 5b2, 5c) and raw `fetch` for low-level HTTP plumbing assertions (Layer 5b).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { SHOULD_RUN, IMAGE, startHttpContainer, jsonRpc, rpc } from './helpers.js';

/**
 * Conditional test runner. When `SHOULD_RUN` is false (no Docker daemon or
 * image unavailable), every suite in this file is silently skipped rather
 * than failing CI. This pattern lets the full test matrix declare Layer 5
 * suites unconditionally while remaining safe in environments without Docker.
 *
 * @type {typeof describe}
 */
const maybe = SHOULD_RUN ? describe : describe.skip;

/**
 * The canonical tool surface. Three tools, no gating.
 *
 * @type {Set<string>}
 * @constant
 */
const EXPECTED_TOOLS = new Set(['list_quills', 'get_specs', 'create_document']);

/**
 * @description Layer 5: HTTP transport protocol compliance via the MCP SDK Client.
 *
 * Exercises the full MCP lifecycle over StreamableHTTP — initialize handshake,
 * capability advertisement, tool enumeration, successful tool calls, and
 * structured error responses — proving the container is a first-class MCP
 * server, not just an HTTP endpoint that happens to return JSON.
 */
maybe('Layer 5: MCP protocol compliance (HTTP transport)', () => {
  let ctx;
  let client;
  let exampleMemo;

  before(async () => {
    ctx = await startHttpContainer();
    exampleMemo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');

    client = new Client({ name: 'layer5-test', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(ctx.mcpUrl));
    await client.connect(transport);
  });

  after(async () => {
    await client?.close().catch(() => {});
    ctx?.stop();
  });

  it('initialize handshake advertises tool capability', () => {
    const caps = client.getServerCapabilities();
    assert.ok(caps, 'server capabilities missing');
    assert.ok(caps.tools !== undefined, 'tools capability missing');
  });

  it('server identifies itself', () => {
    const info = client.getServerVersion();
    assert.ok(info?.name, 'server name missing');
    assert.ok(info?.version, 'server version missing');
  });

  it('tools/list returns exactly list_quills, get_specs, create_document', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.deepEqual(names, EXPECTED_TOOLS, `got ${[...names].join(',')}`);

    for (const t of tools) {
      assert.ok(typeof t.description === 'string' && t.description.length > 0, `${t.name} missing description`);
      assert.ok(t.inputSchema, `${t.name} missing inputSchema`);
      assert.equal(t.inputSchema.type, 'object', `${t.name} inputSchema.type must be object`);
    }
  });

  it('tools/call list_quills returns the bundled usaf_memo quill', async () => {
    const result = await client.callTool({ name: 'list_quills', arguments: {} });
    const quills = result.structuredContent?.quills;
    assert.ok(Array.isArray(quills), 'list_quills should return a quills array');
    assert.ok(quills.some((q) => q.name === 'usaf_memo'), 'usaf_memo not in list');
  });

  it('tools/call get_specs returns TOON spec + instructions for usaf_memo', async () => {
    const result = await client.callTool({
      name: 'get_specs',
      arguments: { quill: 'usaf_memo' },
    });
    const body = result.structuredContent;
    assert.ok(body, 'get_specs returned nothing');
    assert.equal(typeof body.instruction, 'string');
    assert.equal(typeof body.blueprint, 'string');
    assert.ok(body.instruction.length > 0);
  });

  it('tools/call create_document with valid memo returns an artifact URL', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: exampleMemo },
    });
    assert.notEqual(result.isError, true, `create failed: ${JSON.stringify(result)}`);
    const url = result.structuredContent?.url;
    assert.match(url ?? '', /\/artifacts\/[^/]+\.pdf$/, `bad URL ${url}`);
  });

  it('tools/call create_document without QUILL field returns isError', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: '---\nnot_quill: foo\n---\nhello' },
    });
    assert.equal(result.isError, true);
    assert.match((result.content?.[0]?.text ?? '').toLowerCase(), /quill/);
  });

  it('tools/call create_document with unknown quill returns isError', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: '---\nQUILL: no_such_quill\n---\nhi' },
    });
    assert.equal(result.isError, true);
    assert.match(result.content?.[0]?.text ?? '', /no_such_quill|Unable to resolve/);
  });

  it('tools/call get_specs with unknown ref returns isError', async () => {
    const result = await client
      .callTool({ name: 'get_specs', arguments: { quill: 'ghost' } })
      .catch((err) => ({ thrown: err }));
    if (result.thrown) {
      assert.match(String(result.thrown.message ?? result.thrown), /ghost|not.*found|unknown/i);
      return;
    }
    assert.equal(result.isError, true, `expected isError=true, got ${JSON.stringify(result)}`);
    const text = result.content?.[0]?.text ?? '';
    assert.match(text, /ghost|not.*found|unknown/i);
  });
});

/**
 * @description Layer 5b: low-level HTTP plumbing assertions via raw `fetch`.
 *
 * Bypasses the SDK to verify HTTP-level behavior the SDK abstracts away:
 * correct Content-Type on initialize responses (`application/json`, not SSE),
 * and proper 4xx rejection when the required `Accept` header is missing.
 * Guards against transport regressions invisible to the SDK client.
 */
maybe('Layer 5b: low-level HTTP plumbing', () => {
  let ctx;

  before(async () => {
    ctx = await startHttpContainer();
  });

  after(() => {
    ctx?.stop();
  });

  it('initialize POST returns JSON (enableJsonResponse=true), not SSE', async () => {
    const res = await jsonRpc(ctx.mcpUrl, rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'plumbing', version: '0.0.1' },
    }));
    assert.ok(res.status === 200, `status ${res.status}: ${res.raw}`);
    assert.match(res.headers['content-type'] ?? '', /application\/json/);
    assert.ok(res.body?.result, 'missing result in initialize response');
  });

  it('POST without Accept header is rejected', async () => {
    const raw = await fetch(ctx.mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'x', version: '0' },
      })),
    });
    // SDK requires Accept: application/json, text/event-stream — missing should 4xx.
    assert.ok(raw.status >= 400 && raw.status < 500, `expected 4xx, got ${raw.status}`);
  });
});

/**
 * @description Layer 5b2: stateless HTTP client reconnect regression guard.
 *
 * The server runs `StreamableHTTPServerTransport` in stateless mode
 * (`sessionIdGenerator: undefined`). A single container must therefore
 * accept multiple independent initialize handshakes — which is exactly what
 * Claude Code does when it reconnects mid-conversation. Before the stateless
 * flip, the second `Client.connect()` would fail with "Server already
 * initialized". These tests ensure both sequential and concurrent client
 * connections succeed against the same container.
 */
maybe('Layer 5b2: stateless HTTP supports client reconnects', () => {
  let ctx;

  before(async () => {
    ctx = await startHttpContainer();
  });

  after(() => {
    ctx?.stop();
  });

  it('two sequential MCP clients can both initialize and list tools', async () => {
    for (const label of ['first', 'second']) {
      const client = new Client({ name: `reconnect-${label}`, version: '0.0.1' });
      const transport = new StreamableHTTPClientTransport(new URL(ctx.mcpUrl));
      await client.connect(transport);
      const { tools } = await client.listTools();
      assert.deepEqual(
        new Set(tools.map((t) => t.name)),
        EXPECTED_TOOLS,
        `${label} client saw unexpected tools`,
      );
      const result = await client.callTool({ name: 'list_quills', arguments: {} });
      const quills = result.structuredContent?.quills ?? [];
      assert.ok(
        quills.some((q) => q.name === 'usaf_memo'),
        `${label} client could not list quills`,
      );
      await client.close();
    }
  });

  it('two concurrent MCP clients share the same container without collision', async () => {
    const makeClient = async (label) => {
      const client = new Client({ name: `concurrent-${label}`, version: '0.0.1' });
      const transport = new StreamableHTTPClientTransport(new URL(ctx.mcpUrl));
      await client.connect(transport);
      return client;
    };

    const [a, b] = await Promise.all([makeClient('a'), makeClient('b')]);
    try {
      const [listA, listB] = await Promise.all([a.listTools(), b.listTools()]);
      assert.deepEqual(new Set(listA.tools.map((t) => t.name)), EXPECTED_TOOLS);
      assert.deepEqual(new Set(listB.tools.map((t) => t.name)), EXPECTED_TOOLS);
    } finally {
      await Promise.all([a.close().catch(() => {}), b.close().catch(() => {})]);
    }
  });
});

/**
 * @description Layer 5c: stdio transport variant.
 *
 * Spawns a throwaway container with `--stdio` and wires the SDK's
 * `StdioClientTransport` directly to the Docker process's stdin/stdout.
 * Proves the same tool surface is reachable over stdio — the transport
 * Claude Code uses when configured via `install-mcp.sh` in stdio-bridge
 * mode rather than HTTP.
 */
maybe('Layer 5c: stdio transport variant', () => {
  let client;

  before(async () => {
    // Spawn a throwaway container in stdio mode and connect the SDK's
    // StdioClientTransport to the docker process directly.
    const transport = new StdioClientTransport({
      command: 'docker',
      args: [
        'run', '-i', '--rm',
        '--user', '10001:10001',
        '--label', 'quillmark-mcp-test=1',
        IMAGE,
        '--stdio',
      ],
    });
    client = new Client({ name: 'layer5-stdio', version: '0.0.1' });
    await client.connect(transport);
  });

  after(async () => {
    await client?.close().catch(() => {});
  });

  it('stdio transport also exposes the same three tools', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.deepEqual(names, EXPECTED_TOOLS);
  });

  it('stdio transport can list quills', async () => {
    const result = await client.callTool({ name: 'list_quills', arguments: {} });
    const quills = result.structuredContent?.quills ?? [];
    assert.ok(quills.some((q) => q.name === 'usaf_memo'));
  });
});


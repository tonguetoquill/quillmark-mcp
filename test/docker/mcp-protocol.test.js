// Layer 5 — MCP protocol compliance.
// Proves the container speaks a conformant MCP dialect, not just HTTP.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { SHOULD_RUN, IMAGE, startHttpContainer, jsonRpc, rpc } from './helpers.js';

const maybe = SHOULD_RUN ? describe : describe.skip;

const EXPECTED_TOOLS = new Set(['list_quills', 'get_specs', 'create_document']);

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
    const text = result.content?.[0]?.text ?? '';
    const arr = JSON.parse(text);
    assert.ok(Array.isArray(arr), 'list_quills should return an array');
    assert.ok(arr.some((q) => q.name === 'usaf_memo'), 'usaf_memo not in list');
  });

  it('tools/call get_specs returns TOON spec + instructions for usaf_memo', async () => {
    const result = await client.callTool({
      name: 'get_specs',
      arguments: { ref: 'usaf_memo' },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.ok(body, 'get_specs returned nothing');
    // The spec shape is schema + instructions per src/primitives/getSpecs.js.
    assert.ok(
      body.schema || body.spec || body.fields || body.instructions,
      `unexpected get_specs shape: ${JSON.stringify(body).slice(0, 200)}`,
    );
  });

  it('tools/call create_document with valid memo returns an artifact URL', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: exampleMemo },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.equal(body.status, 'success', `create failed: ${JSON.stringify(body)}`);
    assert.match(body.url, /\/artifacts\/[^/]+\.pdf$/, `bad URL ${body.url}`);
  });

  it('tools/call create_document without QUILL field returns structured error', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: '---\nnot_quill: foo\n---\nhello' },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.notEqual(body.status, 'success');
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0, 'errors array missing');
    assert.match(JSON.stringify(body.errors).toLowerCase(), /quill/);
  });

  it('tools/call create_document with unknown quill returns structured error', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: '---\nQUILL: no_such_quill\n---\nhi' },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.notEqual(body.status, 'success');
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  it('tools/call get_specs with unknown ref surfaces a protocol error', async () => {
    // The SDK routes tool-execution errors through result.isError = true rather
    // than rejecting the callTool promise, so assert on that channel.
    const result = await client
      .callTool({ name: 'get_specs', arguments: { ref: 'ghost' } })
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
    const arr = JSON.parse(result.content[0].text);
    assert.ok(arr.some((q) => q.name === 'usaf_memo'));
  });
});

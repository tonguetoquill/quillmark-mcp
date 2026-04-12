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

maybe('Layer 5b2: stateless HTTP supports client reconnects', () => {
  // Regression guard: the server runs StreamableHTTPServerTransport in
  // stateless mode (sessionIdGenerator: undefined). A single container must
  // therefore accept multiple independent initialize handshakes — which is
  // exactly what Claude Code does when it reconnects. Before the stateless
  // flip, the second Client.connect() would fail with "Server already
  // initialized".
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
      const arr = JSON.parse(result.content[0].text);
      assert.ok(
        arr.some((q) => q.name === 'usaf_memo'),
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

maybe('Layer 5d: local-model mode exposes compose_document ONLY when env var is set', () => {
  // Gated-tool test. Starts a separate container with
  // QUILLMARK_LOCAL_MODEL_MODE=1, asserts the 4th tool appears, and renders
  // a real memo through it. Default-mode containers (used by every other
  // Layer 5 test) must still see exactly 3 tools — that's the Claude Code
  // compatibility guarantee.
  let ctx;
  let client;
  let exampleMemo;

  before(async () => {
    ctx = await startHttpContainer({ env: { QUILLMARK_LOCAL_MODEL_MODE: '1' } });
    exampleMemo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');

    client = new Client({ name: 'layer5d-local', version: '0.0.1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(ctx.mcpUrl)));
  });

  after(async () => {
    await client?.close().catch(() => {});
    ctx?.stop();
  });

  it('tools/list includes compose_document plus the original three', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.ok(names.has('compose_document'), 'compose_document missing from local-model mode');
    for (const base of EXPECTED_TOOLS) {
      assert.ok(names.has(base), `${base} missing even in local-model mode`);
    }
    assert.equal(tools.length, 4, `expected 4 tools, got ${tools.length}: ${[...names].join(',')}`);

    const compose = tools.find((t) => t.name === 'compose_document');
    assert.match(compose.description, /Compose and render a document from structured fields/);
    assert.equal(compose.inputSchema.type, 'object');
    assert.ok(compose.inputSchema.properties?.quill);
    assert.ok(compose.inputSchema.properties?.fields);
    assert.ok(compose.inputSchema.properties?.body);
  });

  it('compose_document renders a real memo end-to-end from structured fields', async () => {
    // Parse the bundled example so we test with real, schema-valid field values
    // without hand-maintaining a second fixture.
    const fmMatch = exampleMemo.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    assert.ok(fmMatch, 'could not parse example memo frontmatter');
    const [, fmBlock, bodyRaw] = fmMatch;

    // Light-touch YAML → JS: handles the scalar / sequence subset the example uses.
    const fields = {};
    let currentKey = null;
    for (const line of fmBlock.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const arrayItem = line.match(/^\s+-\s+(.+)$/);
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (arrayItem && currentKey) {
        const v = arrayItem[1].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        if (!Array.isArray(fields[currentKey])) fields[currentKey] = [];
        fields[currentKey].push(v);
      } else if (kv) {
        currentKey = kv[1];
        const raw = kv[2];
        if (raw === '' || raw === undefined) {
          fields[currentKey] = [];
        } else {
          fields[currentKey] = raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        }
      }
    }
    const quill = typeof fields.QUILL === 'string' ? fields.QUILL : 'usaf_memo';
    delete fields.QUILL;

    const result = await client.callTool({
      name: 'compose_document',
      arguments: { quill, fields, body: bodyRaw.trim() },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.equal(body.status, 'success', `compose_document failed: ${JSON.stringify(body)}`);
    assert.match(body.url, /\/artifacts\/[^/]+\.pdf$/, `bad URL ${body.url}`);
  });

  it('compose_document surfaces validation errors as structured error objects', async () => {
    // Send deliberately-incomplete fields (missing memo_from/signature_block).
    // The server should return { status: 'error', errors: [...] } instead of
    // throwing — the model can self-repair from a structured error, not from
    // a protocol exception.
    const result = await client.callTool({
      name: 'compose_document',
      arguments: {
        quill: 'usaf_memo',
        fields: { subject: 'Missing fields test' },
        body: 'Body.',
      },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.notEqual(body.status, 'success');
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0, 'expected errors array');
  });
});

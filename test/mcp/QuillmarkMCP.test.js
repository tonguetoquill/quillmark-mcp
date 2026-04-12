/**
 * @module test/mcp/QuillmarkMCP
 * Tests for {@link QuillmarkMCP} — tool registration (list_quills, get_specs,
 * create_document, compose_document), parameter validation, execution delegation,
 * and server lifecycle (start/preload).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

/**
 * In-memory test double for the MCP server.
 * Records registered tools and start options without performing I/O.
 *
 * @class FakeServer
 * @property {Array<Object>} tools - Registered tool descriptors (name, description, parameters, execute).
 * @property {Object|undefined} startOptions - Options passed to {@link FakeServer#start}.
 */
class FakeServer {
  constructor() {
    this.tools = [];
    this.startOptions = undefined;
  }

  addTool(tool) {
    this.tools.push(tool);
  }

  async start(options) {
    this.startOptions = options;
  }

  async stop() {}
}

/**
 * In-memory test double for the Quill registry.
 * Returns canned quill metadata and tracks resolved refs for assertion.
 *
 * @class FakeRegistry
 * @property {Array<Object>} available - Quill metadata returned by {@link FakeRegistry#getAvailableQuills}.
 * @property {Array<string>} resolvedRefs - Refs passed to {@link FakeRegistry#resolve}, in call order.
 * @property {Object} engine - Stub engine exposing getStrippedSchema, getQuillInfo, and dryRun.
 */
class FakeRegistry {
  constructor() {
    this.available = [];
    this.resolvedRefs = [];
    this.engine = {
      getStrippedSchema: () => ({ type: 'object', properties: {} }),
      getQuillInfo: () => ({ example: 'Write like this.' }),
      dryRun: () => {},
    };
  }

  async getAvailableQuills() {
    return this.available;
  }

  async resolve(ref) {
    this.resolvedRefs.push(ref);
    return { name: ref };
  }
}

/**
 * Factory that wires up a {@link QuillmarkMCP} instance with test doubles.
 * Returns all collaborators for direct inspection in assertions.
 *
 * @param {Object} [options={}] - Extra options forwarded to QuillmarkMCP (e.g. `localModelMode`).
 * @returns {{ mcp: QuillmarkMCP, registry: FakeRegistry, strategy: Object, server: FakeServer }}
 */
function make(options = {}) {
  const registry = new FakeRegistry();
  const strategy = { async handle() { return { status: 'success', url: 'https://example.com/out.pdf' }; } };
  const server = new FakeServer();
  const mcp = new QuillmarkMCP({ registry, strategy, server, ...options });
  return { mcp, registry, strategy, server };
}

describe('QuillmarkMCP', () => {
  it('registers list_quills tool with expected metadata', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'list_quills');
    assert.ok(tool);
    assert.match(tool.description, /List available Quill formats with names and descriptions/);
    assert.strictEqual(tool.parameters, undefined);
  });

  it('registers get_specs tool with parameter schema', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'get_specs');
    assert.ok(tool);
    assert.match(tool.description, /Get the schema and authoring instructions for a specific Quill format/);
    assert.deepStrictEqual(tool.parameters.parse({ ref: 'usaf_memo' }), { ref: 'usaf_memo' });
    assert.throws(() => tool.parameters.parse({}), /Invalid input/);
  });

  it('registers create_document tool with parameter schema', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'create_document');
    assert.ok(tool);
    assert.match(tool.description, /Create a document from Quillmark content/);
    assert.deepStrictEqual(tool.parameters.parse({ content: '---\nQUILL: q\n---\nBody' }), {
      content: '---\nQUILL: q\n---\nBody',
    });
    assert.throws(() => tool.parameters.parse({}), /Invalid input/);
  });

  it('list_quills tool returns quill metadata from registry', async () => {
    const { server, registry } = make();
    registry.available = [
      { name: 'usaf_memo', description: 'USAF memo format' },
      { name: 'resume' },
    ];

    const tool = server.tools.find((t) => t.name === 'list_quills');
    const result = await tool.execute({});

    assert.deepStrictEqual(result, [
      { name: 'usaf_memo', description: 'USAF memo format' },
      { name: 'resume', description: '' },
    ]);
  });

  it('get_specs tool returns schema and instructions for a valid ref', async () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'get_specs');
    const result = await tool.execute({ ref: 'usaf_memo' });

    assert.equal(typeof result.schema, 'string');
    assert.equal(result.instructions, 'Write like this.');
  });

  it('create_document tool delegates to strategy and returns result', async () => {
    const { server, strategy } = make();
    let capturedArgs;
    strategy.handle = async (quill, content) => {
      capturedArgs = { quill, content };
      return { status: 'success', url: 'https://example.com/doc.pdf' };
    };

    const tool = server.tools.find((t) => t.name === 'create_document');
    const result = await tool.execute({ content: '---\nQUILL: usaf_memo\n---\nBody' });

    assert.deepStrictEqual(result, { status: 'success', url: 'https://example.com/doc.pdf' });
    assert.equal(capturedArgs.quill.name, 'usaf_memo');
    assert.match(capturedArgs.content, /QUILL: usaf_memo/);
  });

  it('does NOT register compose_document by default (Claude Code contract unchanged)', () => {
    const { server } = make();
    assert.equal(server.tools.find((t) => t.name === 'compose_document'), undefined);
    assert.equal(server.tools.length, 3, `expected exactly 3 tools, got ${server.tools.map(t => t.name).join(',')}`);
  });

  it('registers compose_document ONLY when localModelMode is true', () => {
    const { server } = make({ localModelMode: true });
    const tool = server.tools.find((t) => t.name === 'compose_document');
    assert.ok(tool, 'compose_document not registered');
    assert.match(tool.description, /Compose and render a document from structured fields/);
    assert.equal(server.tools.length, 4);
  });

  it('compose_document parameter schema accepts structured fields', () => {
    const { server } = make({ localModelMode: true });
    const tool = server.tools.find((t) => t.name === 'compose_document');
    const parsed = tool.parameters.parse({
      quill: 'usaf_memo',
      fields: { subject: 'Hi', memo_from: ['A', 'B'] },
      body: 'Para 1.',
    });
    assert.equal(parsed.quill, 'usaf_memo');
    assert.deepStrictEqual(parsed.fields, { subject: 'Hi', memo_from: ['A', 'B'] });
    assert.equal(parsed.body, 'Para 1.');
  });

  it('compose_document assembles YAML and delegates to createDocument primitive', async () => {
    const { server, strategy } = make({ localModelMode: true });
    let capturedContent;
    strategy.handle = async (quill, content) => {
      capturedContent = content;
      return { status: 'success', url: 'https://example.com/composed.pdf' };
    };

    const tool = server.tools.find((t) => t.name === 'compose_document');
    const result = await tool.execute({
      quill: 'usaf_memo',
      fields: {
        subject: 'Reflective Belts at Night',
        memo_from: ['673 ABW/CC', 'JBER', 'Anchorage AK'],
      },
      body: 'First paragraph.\n\nSecond paragraph.',
    });

    assert.deepStrictEqual(result, { status: 'success', url: 'https://example.com/composed.pdf' });
    // QUILL must land in the assembled content — it's how the primitive resolves the Quill.
    assert.match(capturedContent, /^---\n/);
    assert.match(capturedContent, /QUILL: "usaf_memo"/);
    assert.match(capturedContent, /subject: "Reflective Belts at Night"/);
    assert.match(capturedContent, /memo_from:\n  - "673 ABW\/CC"/);
    assert.match(capturedContent, /\n---\n\nFirst paragraph\./);
  });

  it('compose_document param `quill` overrides any QUILL key that sneaks into fields', async () => {
    const { server, strategy } = make({ localModelMode: true });
    let capturedContent;
    strategy.handle = async (_q, content) => {
      capturedContent = content;
      return { status: 'success', url: 'x' };
    };

    const tool = server.tools.find((t) => t.name === 'compose_document');
    await tool.execute({
      quill: 'usaf_memo',
      fields: { QUILL: 'resume', subject: 'Test' },
      body: 'body',
    });

    // Only the param-level quill should appear, exactly once.
    const quillMatches = capturedContent.match(/^QUILL:/gm) ?? [];
    assert.equal(quillMatches.length, 1);
    assert.match(capturedContent, /QUILL: "usaf_memo"/);
    assert.doesNotMatch(capturedContent, /QUILL: "resume"/);
  });

  it('compose_document surfaces validation errors from the primitive path', async () => {
    const { server, strategy } = make({ localModelMode: true });
    strategy.handle = async () => ({
      status: 'error',
      errors: [{ message: 'memo_from is a required property' }],
    });

    const tool = server.tools.find((t) => t.name === 'compose_document');
    const result = await tool.execute({
      quill: 'usaf_memo',
      fields: { subject: 'Hi' },
      body: 'body',
    });

    assert.equal(result.status, 'error');
    assert.ok(Array.isArray(result.errors));
    assert.match(result.errors[0].message, /memo_from/);
  });

  it('start preloads all available quills then starts the server', async () => {
    const { mcp, registry, server } = make();
    registry.available = [
      { name: 'usaf_memo', version: '1.0.0' },
      { name: 'resume', version: '2.0.0' },
      { name: 'bare' },
    ];

    await mcp.start({ transportType: 'stdio' });

    assert.deepStrictEqual(registry.resolvedRefs, ['usaf_memo@1.0.0', 'resume@2.0.0', 'bare']);
    assert.deepStrictEqual(server.startOptions, { transportType: 'stdio' });
  });
});

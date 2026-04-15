/**
 * @module test/mcp/QuillmarkMCP
 * Tests for {@link QuillmarkMCP} — tool registration (list_quills, get_specs,
 * create_document), parameter validation, execution delegation, and server
 * lifecycle (start/preload).
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
 * @property {Object} engine - Stub engine exposing getQuillSchema, getQuillInfo, and dryRun.
 */
class FakeRegistry {
  constructor() {
    this.available = [];
    this.resolvedRefs = [];
    this.engine = {
      getQuillSchema: () => 'name: stub\nfields: {}\n',
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
 * @returns {{ mcp: QuillmarkMCP, registry: FakeRegistry, strategy: Object, server: FakeServer }}
 */
function make() {
  const registry = new FakeRegistry();
  const strategy = { async handle() { return { status: 'success', url: 'https://example.com/out.pdf' }; } };
  const server = new FakeServer();
  const mcp = new QuillmarkMCP({ registry, strategy, server });
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

  it('registers exactly three tools and nothing else', () => {
    const { server } = make();
    const names = server.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['create_document', 'get_specs', 'list_quills']);
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

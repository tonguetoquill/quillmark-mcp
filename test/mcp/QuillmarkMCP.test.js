/**
 * @module test/mcp/QuillmarkMCP
 * Tests for {@link QuillmarkMCP} — tool registration (list_quills, get_specs,
 * create_document), parameter validation, execution delegation, and server
 * lifecycle (start with quiver.warm()).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

/**
 * In-memory test double for the MCP server.
 */
class FakeServer {
  constructor() {
    this.tools = [];
    this.startOptions = undefined;
  }
  addTool(tool) { this.tools.push(tool); }
  async start(options) { this.startOptions = options; }
  async stop() {}
}

/**
 * In-memory test double for a Quiver. Returns canned quill names + lazy
 * `getQuill` results that mirror the new `@quillmark/wasm` metadata shape.
 */
class FakeQuiver {
  constructor() {
    this.names = [];
    this.warmCalls = 0;
    this.getQuillCalls = [];
    this.quills = {
      default: {
        metadata: {
          description: 'USAF memo format',
          schema: {
            name: 'usaf_memo',
            main: { fields: {} },
            example: 'Write like this.',
          },
        },
      },
    };
  }
  quillNames() { return this.names; }
  versionsOf() { return ['1.0.0']; }
  async getQuill(ref) {
    this.getQuillCalls.push(ref);
    return this.quills[ref] ?? this.quills.default;
  }
  async warm() { this.warmCalls += 1; }
}

const FAKE_ENGINE = { quill() { /* unused — getQuill is stubbed on the quiver */ } };

function make() {
  const quiver = new FakeQuiver();
  const strategy = { async handle() { return { status: 'success', url: 'https://example.com/out.pdf' }; } };
  const server = new FakeServer();
  const mcp = new QuillmarkMCP({ quiver, engine: FAKE_ENGINE, strategy, server });
  return { mcp, quiver, strategy, server };
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

  it('list_quills tool returns quill names and descriptions from materialized metadata', async () => {
    const { server, quiver } = make();
    quiver.names = ['usaf_memo', 'resume'];
    quiver.quills = {
      usaf_memo: { metadata: { description: 'USAF memo format' } },
      resume: { metadata: {} },
    };

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

  it('create_document tool delegates to strategy with (quill, doc) and returns result', async () => {
    const { server, strategy } = make();
    let captured;
    strategy.handle = async (quill, doc) => {
      captured = { quill, doc };
      return { status: 'success', url: 'https://example.com/doc.pdf' };
    };

    const tool = server.tools.find((t) => t.name === 'create_document');
    const result = await tool.execute({ content: '---\nQUILL: usaf_memo\n---\nBody' });

    assert.deepStrictEqual(result, { status: 'success', url: 'https://example.com/doc.pdf' });
    assert.equal(captured.quill.metadata.schema.name, 'usaf_memo');
    assert.equal(captured.doc.quillRef, 'usaf_memo');
  });

  it('registers exactly three tools and nothing else', () => {
    const { server } = make();
    const names = server.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['create_document', 'get_specs', 'list_quills']);
  });

  it('start calls quiver.warm() before the server starts', async () => {
    const { mcp, quiver, server } = make();
    quiver.names = ['usaf_memo', 'resume', 'bare'];

    await mcp.start({ transportType: 'stdio' });

    assert.strictEqual(quiver.warmCalls, 1);
    assert.deepStrictEqual(server.startOptions, { transportType: 'stdio' });
  });

  it('start tolerates a quiver.warm() failure without crashing the server', async () => {
    const { mcp, quiver, server } = make();
    quiver.names = ['usaf_memo'];
    quiver.warm = async () => { throw new Error('disk gone'); };

    await mcp.start({ transportType: 'stdio' });

    assert.deepStrictEqual(server.startOptions, { transportType: 'stdio' });
  });
});

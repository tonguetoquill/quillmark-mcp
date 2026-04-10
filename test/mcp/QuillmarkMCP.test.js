import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

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

function make(overrides = {}) {
  const registry = new FakeRegistry();
  const strategy = { async handle() { return { status: 'success', url: 'https://example.com/out.pdf' }; } };
  const server = new FakeServer();

  const mcp = new QuillmarkMCP({
    registry,
    strategy,
    server,
    ...overrides,
  });

  return { mcp, registry, strategy, server };
}

describe('QuillmarkMCP', () => {
  it('constructor stores dependencies', () => {
    const { mcp, registry, strategy, server } = make();

    assert.strictEqual(mcp.registry, registry);
    assert.strictEqual(mcp.strategy, strategy);
    assert.strictEqual(mcp.server, server);
  });

  it('throws when registry is missing or invalid', () => {
    assert.throws(
      () => new QuillmarkMCP({ registry: null, strategy: { handle() {} }, server: { addTool() {} } }),
      /registry with a resolve\(\) method/,
    );
  });

  it('throws when strategy is missing or invalid', () => {
    assert.throws(
      () => new QuillmarkMCP({ registry: { resolve() {} }, strategy: null, server: { addTool() {} } }),
      /delivery strategy with a handle\(\) method/,
    );
  });

  it('throws when server is missing or invalid', () => {
    assert.throws(
      () => new QuillmarkMCP({ registry: { resolve() {} }, strategy: { handle() {} }, server: null }),
      /server with an addTool\(\) method/,
    );
  });

  it('registers list_quills tool with expected metadata', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'list_quills');
    assert.ok(tool);
    assert.match(tool.description, /List available Quills with names and descriptions/);
    assert.strictEqual(tool.parameters, undefined);
  });

  it('registers get_specs tool with parameter schema', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'get_specs');
    assert.ok(tool);
    assert.match(tool.description, /Get the schema and authoring instructions for a specific Quill/);
    assert.equal(typeof tool.parameters.parse, 'function');
    assert.deepStrictEqual(tool.parameters.parse({ ref: 'usaf_memo' }), { ref: 'usaf_memo' });
    assert.throws(() => tool.parameters.parse({}), /Invalid input/);
  });

  it('registers create_document tool with parameter schema', () => {
    const { server } = make();

    const tool = server.tools.find((t) => t.name === 'create_document');
    assert.ok(tool);
    assert.match(tool.description, /Create a document from Quillmark content/);
    assert.equal(typeof tool.parameters.parse, 'function');
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

  it('stop delegates to server', async () => {
    const { mcp, server } = make();
    let stopped = false;
    server.stop = async () => { stopped = true; };

    await mcp.stop();

    assert.ok(stopped);
  });
});

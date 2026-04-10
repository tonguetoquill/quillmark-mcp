import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

class FakeFastMCP {
  constructor(options) {
    this.options = options;
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

class FakeFileSystemSource {
  constructor(quillsDir) {
    this.quillsDir = quillsDir;
  }
}

class FakeQuillmark {
  constructor() {
    this.id = 'fake-engine';
  }
}

class FakeQuillRegistry {
  constructor({ source, engine }) {
    this.source = source;
    this.engine = engine;
    this.available = [];
    this.resolvedRefs = [];
  }

  async getAvailableQuills() {
    return this.available;
  }

  async resolve(ref) {
    this.resolvedRefs.push(ref);
    return { name: ref };
  }
}

function makeServer(overrides = {}) {
  const calls = {
    listQuills: [],
    getSpecs: [],
    createDocument: [],
    initCount: 0,
  };

  const strategy = {
    async handle() {
      return { status: 'success', url: 'https://example.com/output.pdf' };
    },
  };

  const server = new QuillmarkMCP({
    quillsDir: '/tmp/quills',
    strategy,
    deps: {
      FastMCPClass: FakeFastMCP,
      FileSystemSourceClass: FakeFileSystemSource,
      QuillRegistryClass: FakeQuillRegistry,
      QuillmarkClass: FakeQuillmark,
      initWasm: () => {
        calls.initCount += 1;
      },
      primitives: {
        listQuills: async (registry) => {
          calls.listQuills.push({ registry });
          return [{ name: 'usaf_memo', description: 'memo' }];
        },
        getSpecs: async (registry, ref) => {
          calls.getSpecs.push({ registry, ref });
          return { schema: 'toon', instructions: 'write this way' };
        },
        createDocument: async (registry, passedStrategy, content) => {
          calls.createDocument.push({ registry, strategy: passedStrategy, content });
          return { status: 'success', url: 'https://example.com/doc.pdf' };
        },
      },
      ...overrides,
    },
  });

  return { server, calls, strategy };
}

describe('QuillmarkMCP', () => {
  it('constructor creates instance', () => {
    const { server } = makeServer();

    assert.ok(server);
    assert.strictEqual(server.server.options.name, 'Quillmark MCP');
    assert.strictEqual(server.server.options.version, '1.0.0');
  });

  it('registers list_quills tool with expected metadata', () => {
    const { server } = makeServer();

    const tool = server.server.tools.find((candidate) => candidate.name === 'list_quills');
    assert.ok(tool);
    assert.match(tool.description, /List available Quills with names and descriptions/);
    assert.strictEqual(tool.parameters, undefined);
  });

  it('registers get_specs tool with parameter schema', () => {
    const { server } = makeServer();

    const tool = server.server.tools.find((candidate) => candidate.name === 'get_specs');
    assert.ok(tool);
    assert.match(tool.description, /Get the schema and authoring instructions for a specific Quill/);
    assert.equal(typeof tool.parameters.parse, 'function');
    assert.deepStrictEqual(tool.parameters.parse({ ref: 'usaf_memo' }), { ref: 'usaf_memo' });
    assert.throws(() => tool.parameters.parse({}), /Invalid input/);
  });

  it('registers create_document tool with parameter schema', () => {
    const { server } = makeServer();

    const tool = server.server.tools.find((candidate) => candidate.name === 'create_document');
    assert.ok(tool);
    assert.match(tool.description, /Create a document from Quillmark content/);
    assert.equal(typeof tool.parameters.parse, 'function');
    assert.deepStrictEqual(tool.parameters.parse({ content: '---\nQUILL: q\n---\nBody' }), {
      content: '---\nQUILL: q\n---\nBody',
    });
    assert.throws(() => tool.parameters.parse({}), /Invalid input/);
  });

  it('tool handlers delegate to primitives and start initializes lifecycle', async () => {
    const { server, calls, strategy } = makeServer();

    server.registry.available = [
      { name: 'usaf_memo', version: '1.0.0' },
      { name: 'resume', version: '2.0.0' },
    ];

    const listTool = server.server.tools.find((candidate) => candidate.name === 'list_quills');
    const specsTool = server.server.tools.find((candidate) => candidate.name === 'get_specs');
    const createTool = server.server.tools.find((candidate) => candidate.name === 'create_document');

    await listTool.execute({});
    await specsTool.execute({ ref: 'usaf_memo' });
    await createTool.execute({ content: '---\nQUILL: usaf_memo\n---\nBody' });

    assert.strictEqual(calls.listQuills.length, 1);
    assert.strictEqual(calls.getSpecs.length, 1);
    assert.deepStrictEqual(calls.getSpecs[0].ref, 'usaf_memo');
    assert.strictEqual(calls.createDocument.length, 1);
    assert.strictEqual(calls.createDocument[0].strategy, strategy);
    assert.strictEqual(calls.createDocument[0].content, '---\nQUILL: usaf_memo\n---\nBody');

    await server.start({ transportType: 'stdio' });

    assert.strictEqual(calls.initCount, 1);
    assert.deepStrictEqual(server.registry.resolvedRefs, ['usaf_memo@1.0.0', 'resume@2.0.0']);
    assert.deepStrictEqual(server.server.startOptions, { transportType: 'stdio' });
  });
});

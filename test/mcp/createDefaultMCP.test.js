import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultMCP } from '../../src/mcp/createDefaultMCP.js';
import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

class FakeFastMCP {
  constructor(options) {
    this.options = options;
    this.tools = [];
  }

  addTool(tool) {
    this.tools.push(tool);
  }

  async start() {}
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
  }

  async getAvailableQuills() {
    return [];
  }

  async resolve(ref) {
    return { name: ref };
  }
}

function makeDeps(overrides = {}) {
  let initCalled = false;

  return {
    deps: {
      FastMCPClass: FakeFastMCP,
      FileSystemSourceClass: FakeFileSystemSource,
      QuillRegistryClass: FakeQuillRegistry,
      QuillmarkClass: FakeQuillmark,
      initWasm: () => { initCalled = true; },
      ...overrides,
    },
    wasInitCalled: () => initCalled,
  };
}

const fakeStrategy = { async handle() { return { status: 'success' }; } };

describe('createDefaultMCP', () => {
  it('throws when quillsDir is missing', () => {
    assert.throws(
      () => createDefaultMCP({ strategy: fakeStrategy }),
      /non-empty quillsDir option/,
    );
  });

  it('throws when quillsDir is empty string', () => {
    assert.throws(
      () => createDefaultMCP({ quillsDir: '   ', strategy: fakeStrategy }),
      /non-empty quillsDir option/,
    );
  });

  it('throws when strategy is missing', () => {
    assert.throws(
      () => createDefaultMCP({ quillsDir: '/quills' }),
      /delivery strategy with a handle\(\) method/,
    );
  });

  it('returns a QuillmarkMCP instance', () => {
    const { deps } = makeDeps();

    const mcp = createDefaultMCP({ quillsDir: '/quills', strategy: fakeStrategy, deps });

    assert.ok(mcp instanceof QuillmarkMCP);
  });

  it('calls initWasm during construction', () => {
    const { deps, wasInitCalled } = makeDeps();

    createDefaultMCP({ quillsDir: '/quills', strategy: fakeStrategy, deps });

    assert.ok(wasInitCalled());
  });

  it('wires FileSystemSource with the provided quillsDir', () => {
    const { deps } = makeDeps();

    const mcp = createDefaultMCP({ quillsDir: '/my/quills', strategy: fakeStrategy, deps });

    assert.ok(mcp.registry.source instanceof FakeFileSystemSource);
    assert.equal(mcp.registry.source.quillsDir, '/my/quills');
  });

  it('wires QuillRegistry with engine and source', () => {
    const { deps } = makeDeps();

    const mcp = createDefaultMCP({ quillsDir: '/quills', strategy: fakeStrategy, deps });

    assert.ok(mcp.registry instanceof FakeQuillRegistry);
    assert.ok(mcp.registry.engine instanceof FakeQuillmark);
  });

  it('creates FastMCP server with default name and version', () => {
    const { deps } = makeDeps();

    const mcp = createDefaultMCP({ quillsDir: '/quills', strategy: fakeStrategy, deps });

    assert.equal(mcp.server.options.name, 'Quillmark');
    assert.equal(mcp.server.options.version, '1.0.0');
  });

  it('creates FastMCP server with custom name and version', () => {
    const { deps } = makeDeps();

    const mcp = createDefaultMCP({
      quillsDir: '/quills',
      strategy: fakeStrategy,
      server: { name: 'MyServer', version: '2.3.4' },
      deps,
    });

    assert.equal(mcp.server.options.name, 'MyServer');
    assert.equal(mcp.server.options.version, '2.3.4');
  });
});

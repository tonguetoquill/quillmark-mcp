import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QuillmarkMCP } from '../../src/mcp/QuillmarkMCP.js';

class FakeServer {
  constructor() {
    this.tools = [];
    this.startOptions = undefined;
  }
  addTool(tool) { this.tools.push(tool); }
  async start(options) { this.startOptions = options; }
  async stop() {}
}

class FakeQuiver {
  constructor() {
    this.names = [];
    this.warmCalls = 0;
    this.getQuillCalls = [];
    this.quills = {
      default: {
        schema: { main: { fields: {} } },
        blueprint: 'Write like this.',
        metadata: {
          name: 'usaf_memo',
          version: '1.0.0',
          description: 'USAF memo format',
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

const FAKE_ENGINE = { quill() { /* unused */ } };

function make() {
  const quiver = new FakeQuiver();
  const strategy = {
    async handle() { return { url: 'https://example.com/out.pdf', mimeType: 'application/pdf' }; },
  };
  const server = new FakeServer();
  const mcp = new QuillmarkMCP({ quiver, engine: FAKE_ENGINE, strategy, server });
  return { mcp, quiver, strategy, server };
}

function findTool(server, name) {
  const tool = server.tools.find((t) => t.name === name);
  assert.ok(tool, `expected tool ${name}`);
  return tool;
}

describe('QuillmarkMCP', () => {
  it('exposes server-level instructions for the workflow chain', () => {
    assert.match(QuillmarkMCP.instructions, /list_quills/);
    assert.match(QuillmarkMCP.instructions, /get_specs/);
    assert.match(QuillmarkMCP.instructions, /create_document/);
  });

  it('registers list_quills with empty inputSchema and quills outputSchema', () => {
    const { server } = make();
    const tool = findTool(server, 'list_quills');
    assert.match(tool.description, /List available document formats/);
    assert.deepStrictEqual(tool.inputSchema, {});
    assert.ok(tool.outputSchema?.quills);
  });

  it('registers get_specs with quill input and instruction/blueprint output', () => {
    const { server } = make();
    const tool = findTool(server, 'get_specs');
    assert.match(tool.description, /Learn how to compose/);
    assert.deepStrictEqual(tool.inputSchema.quill.parse('usaf_memo'), 'usaf_memo');
    assert.throws(() => tool.inputSchema.quill.parse(''));
    assert.ok(tool.outputSchema?.instruction);
    assert.ok(tool.outputSchema?.blueprint);
  });

  it('registers create_document with content input', () => {
    const { server } = make();
    const tool = findTool(server, 'create_document');
    assert.match(tool.description, /Render a document/);
    assert.deepStrictEqual(tool.inputSchema.content.parse('~~~card-yaml\n#@quill: q\n~~~\nBody'), '~~~card-yaml\n#@quill: q\n~~~\nBody');
    assert.throws(() => tool.inputSchema.content.parse(''));
  });

  it('list_quills returns text + structuredContent.quills from materialized metadata', async () => {
    const { server, quiver } = make();
    quiver.names = ['usaf_memo', 'resume'];
    quiver.quills = {
      usaf_memo: { metadata: { version: '1.0.0', description: 'USAF memo format' } },
      resume: { metadata: { version: '0.1.0' } },
    };

    const tool = findTool(server, 'list_quills');
    const result = await tool.execute({});

    assert.deepStrictEqual(result.structuredContent, {
      quills: [
        { name: 'usaf_memo', version: '1.0.0', description: 'USAF memo format' },
        { name: 'resume', version: '0.1.0', description: '' },
      ],
    });
    assert.equal(result.content[0].type, 'text');
    assert.match(result.content[0].text, /usaf_memo@1\.0\.0: USAF memo format/);
    assert.match(result.content[0].text, /resume@0\.1\.0/);
  });

  it('get_specs returns text (instruction + blueprint) and structuredContent', async () => {
    const { server } = make();

    const tool = findTool(server, 'get_specs');
    const result = await tool.execute({ quill: 'usaf_memo' });

    assert.equal(result.structuredContent.blueprint, 'Write like this.');
    assert.match(result.structuredContent.instruction, /usaf_memo/);
    assert.match(result.content[0].text, /usaf_memo/);
    assert.match(result.content[0].text, /Write like this\./);
  });

  it('get_specs returns isError result when the primitive throws', async () => {
    const { server, quiver } = make();
    quiver.getQuill = async () => { throw new Error('unknown_quill'); };

    const tool = findTool(server, 'get_specs');
    const result = await tool.execute({ quill: 'nope' });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unknown_quill/);
  });

  it('create_document returns text + resource_link + structuredContent on success', async () => {
    const { server, strategy } = make();
    let captured;
    strategy.handle = async (quill, doc) => {
      captured = { quill, doc };
      return { url: 'https://example.com/doc.pdf', mimeType: 'application/pdf' };
    };

    const tool = findTool(server, 'create_document');
    const result = await tool.execute({ content: '~~~card-yaml\n#@quill: usaf_memo\n~~~\nBody' });

    assert.equal(captured.quill.metadata.name, 'usaf_memo');
    assert.equal(captured.doc.quillRef, 'usaf_memo');
    assert.deepStrictEqual(result.structuredContent, { url: 'https://example.com/doc.pdf', mimeType: 'application/pdf' });
    assert.equal(result.content[0].type, 'text');
    assert.match(result.content[0].text, /\[Document\]\(https:\/\/example\.com\/doc\.pdf\)/);
    const link = result.content.find((c) => c.type === 'resource_link');
    assert.ok(link);
    assert.equal(link.uri, 'https://example.com/doc.pdf');
    assert.equal(link.mimeType, 'application/pdf');
  });

  it('create_document returns isError + formatted diagnostics on render failure', async () => {
    const { server, strategy } = make();
    strategy.handle = async () => {
      throw Object.assign(new Error('render exploded'), {
        diagnostics: [{ severity: 'error', message: 'unknown field', hint: 'try x' }],
      });
    };

    const tool = findTool(server, 'create_document');
    const result = await tool.execute({ content: '~~~card-yaml\n#@quill: usaf_memo\n~~~\nBody' });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /render exploded/);
    assert.match(result.content[0].text, /\[error\] unknown field/);
    assert.match(result.content[0].text, /Hint: try x/);
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

  it('start propagates quiver.warm() failures without starting the server', async () => {
    const { mcp, quiver, server } = make();
    quiver.names = ['usaf_memo'];
    quiver.warm = async () => { throw new Error('disk gone'); };

    await assert.rejects(() => mcp.start({ transportType: 'stdio' }), /disk gone/);
    assert.strictEqual(server.startOptions, undefined);
  });
});

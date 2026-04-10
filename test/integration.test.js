import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

import {
  QuillmarkMCP,
  createDefaultMCP,
  createDocument,
  getSpecs,
  listQuills,
  PassThroughStrategy,
  RenderAndHostStrategy,
} from '../src/index.js';

const FIXTURE_QUILLS_DIR = fileURLToPath(new URL('./fixtures/quills', import.meta.url));

function createRegistry() {
  init();
  const engine = new Quillmark();
  return new QuillRegistry({
    source: new FileSystemSource(FIXTURE_QUILLS_DIR),
    engine,
  });
}

describe('integration', () => {
  it('supports cold-start discovery journey end-to-end', async () => {
    const registry = createRegistry();
    const available = await listQuills(registry);

    assert.ok(available.some((quill) => quill.name === 'usaf_memo'));

    const specs = await getSpecs(registry, 'usaf_memo');
    assert.equal(typeof specs.schema, 'string');
    assert.ok(specs.schema.length > 0);
    assert.equal(specs.instructions, 'Keep tone formal.');

    const strategy = new PassThroughStrategy(async (quill, content) => {
      assert.equal(quill.name, 'usaf_memo');
      assert.match(content, /QUILL:\s*usaf_memo/);
      return { status: 'success', url: 'https://example.com/out.pdf' };
    });

    const result = await createDocument(
      registry,
      strategy,
      '---\nQUILL: usaf_memo\n---\n# Memo\n\nBody text.',
    );

    assert.deepStrictEqual(result, {
      status: 'success',
      url: 'https://example.com/out.pdf',
    });
  });

  it('covers primitive error paths', async () => {
    const registry = createRegistry();

    await assert.rejects(() => getSpecs(registry, 'missing_quill'));

    const strategy = new PassThroughStrategy(async () => ({ status: 'success', url: 'https://example.com' }));

    const missingQuill = await createDocument(registry, strategy, '---\nTITLE: Memo\n---\nBody');
    assert.deepStrictEqual(missingQuill, {
      status: 'error',
      errors: [{ message: 'QUILL field is required in frontmatter.' }],
    });

    registry.engine.dryRun = () => {
      throw new Error('content validation failed');
    };

    const invalidContent = await createDocument(
      registry,
      strategy,
      '---\nQUILL: usaf_memo\n---\n# Invalid body',
    );

    assert.deepStrictEqual(invalidContent, {
      status: 'error',
      errors: [{ message: 'content validation failed' }],
    });
  });

  it('createDefaultMCP wires up the default stack against real fixtures', () => {
    const strategy = new PassThroughStrategy(async () => ({ status: 'success' }));
    const mcp = createDefaultMCP({ quillsDir: FIXTURE_QUILLS_DIR, strategy });

    assert.ok(mcp instanceof QuillmarkMCP);
    assert.equal(mcp.strategy, strategy);
    assert.ok(typeof mcp.registry.resolve === 'function');
  });

  it('exposes root and subpath exports', async () => {
    assert.equal(typeof QuillmarkMCP, 'function');
    assert.equal(typeof createDefaultMCP, 'function');
    assert.equal(typeof listQuills, 'function');
    assert.equal(typeof getSpecs, 'function');
    assert.equal(typeof createDocument, 'function');
    assert.equal(typeof PassThroughStrategy, 'function');
    assert.equal(typeof RenderAndHostStrategy, 'function');

    const root = await import('quillmark-mcp');
    const primitives = await import('quillmark-mcp/primitives');
    const strategies = await import('quillmark-mcp/strategies');
    const mcp = await import('quillmark-mcp/mcp');

    assert.equal(typeof root.QuillmarkMCP, 'function');
    assert.equal(typeof root.createDefaultMCP, 'function');
    assert.equal(typeof primitives.listQuills, 'function');
    assert.equal(typeof strategies.PassThroughStrategy, 'function');
    assert.equal(typeof mcp.QuillmarkMCP, 'function');
    assert.equal(typeof mcp.createDefaultMCP, 'function');
  });
});

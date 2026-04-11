import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

import { createDefaultMCP } from '../src/index.js';
import { QuillmarkMCP } from '../src/mcp/index.js';
import { listQuills, getSpecs, createDocument } from '../src/primitives/index.js';

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

    const strategy = {
      async handle(quill, content) {
        assert.equal(quill.name, 'usaf_memo');
        assert.match(content, /QUILL:\s*usaf_memo/);
        return { status: 'success', url: 'https://example.com/out.pdf' };
      },
    };

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

    const strategy = {
      async handle() {
        return { status: 'success', url: 'https://example.com' };
      },
    };

    const missingQuill = await createDocument(registry, strategy, '---\nTITLE: Memo\n---\nBody');
    assert.deepStrictEqual(missingQuill, {
      status: 'error',
      errors: [{ message: 'QUILL: is required in frontmatter to select the Quill format.' }],
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
    const strategy = {
      async handle() {
        return { status: 'success' };
      },
    };
    const mcp = createDefaultMCP({ quillsDir: FIXTURE_QUILLS_DIR, strategy });

    assert.ok(mcp instanceof QuillmarkMCP);
    assert.equal(mcp.strategy, strategy);
    assert.ok(typeof mcp.registry.resolve === 'function');
  });

  it('exposes root and subpath exports', async () => {
    // Public API: only createDefaultMCP and DeliveryStrategy at root
    assert.equal(typeof createDefaultMCP, 'function');

    // Internal APIs available via subpath imports
    const root = await import('quillmark-mcp');
    assert.equal(typeof root.createDefaultMCP, 'function');

    const primitives = await import('quillmark-mcp/primitives');
    assert.equal(typeof primitives.listQuills, 'function');
    assert.equal(typeof primitives.getSpecs, 'function');
    assert.equal(typeof primitives.createDocument, 'function');

    const strategies = await import('quillmark-mcp/strategies');
    assert.equal(typeof strategies.DeliveryStrategy, 'function');
    assert.equal(typeof strategies.RenderAndHostStrategy, 'function');

    const mcpModule = await import('quillmark-mcp/mcp');
    assert.equal(typeof mcpModule.QuillmarkMCP, 'function');
    assert.equal(typeof mcpModule.createDefaultMCP, 'function');
  });
});

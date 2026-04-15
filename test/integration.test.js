/**
 * @module integration.test
 * @description Integration tests covering the cold-start discovery journey
 * (listQuills -> getSpecs -> createDocument), primitive error paths,
 * createDefaultMCP factory wiring, and package subpath exports.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

import { createDefaultMCP } from '../src/index.js';
import { QuillmarkMCP } from '../src/mcp/index.js';
import { listQuills, getSpecs, createDocument } from '../src/primitives/index.js';
import { RenderAndHostStrategy } from '../src/strategies/index.js';

/** @constant {string} FIXTURE_QUILLS_DIR - Absolute path to test fixture quill definitions (e.g. usaf_memo). */
const FIXTURE_QUILLS_DIR = fileURLToPath(new URL('./fixtures/quills', import.meta.url));

/** @constant {string} REAL_QUILLS_DIR - Path to the shipped quills/ directory. */
const REAL_QUILLS_DIR = fileURLToPath(new URL('../quills', import.meta.url));

/** @constant {string[]} The four quills shipped with the package. */
const SHIPPED_QUILLS = [
  { name: 'nyt_news_article', version: '0.1.0' },
  { name: 'cnn_news_article', version: '0.1.0' },
  { name: 'static_analysis_report', version: '0.1.0' },
  { name: 'usaf_memo', version: '0.2.0' },
];

/**
 * Bootstraps a fresh QuillRegistry backed by the fixture quills directory.
 * Initialises the WASM engine as a side-effect.
 * @returns {QuillRegistry} Registry ready for listQuills / getSpecs / createDocument.
 */
function createRegistry() {
  init();
  const engine = new Quillmark();
  return new QuillRegistry({
    source: new FileSystemSource(FIXTURE_QUILLS_DIR),
    engine,
  });
}

/** @description Full integration suite — exercises primitives, factory, and package exports against real fixture data. */
describe('integration', () => {
  /** @description Walks the happy-path discovery flow: list -> specs -> render via a stub strategy. */
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

  /** @description Validates error handling: unknown quill, missing QUILL frontmatter, and engine validation failure. */
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

  /** @description Ensures createDefaultMCP returns a QuillmarkMCP with a working registry and the provided strategy. */
  it('createDefaultMCP wires up the default stack against real fixtures', async () => {
    const strategy = {
      async handle() {
        return { status: 'success' };
      },
    };
    const mcp = await createDefaultMCP({ quillsDir: FIXTURE_QUILLS_DIR, strategy });

    assert.ok(mcp instanceof QuillmarkMCP);
    assert.equal(mcp.strategy, strategy);
    assert.ok(typeof mcp.registry.resolve === 'function');
  });

  /** @description End-to-end render proof for every shipped quill. */
  describe('shipped quills render end-to-end', () => {
    let outputDir;
    let registry;

    before(async () => {
      outputDir = await mkdtemp(path.join(tmpdir(), 'quillmark-integration-'));
      init();
      registry = new QuillRegistry({
        source: new FileSystemSource(REAL_QUILLS_DIR),
        engine: new Quillmark(),
      });
    });

    after(async () => {
      await rm(outputDir, { recursive: true, force: true });
    });

    for (const { name, version } of SHIPPED_QUILLS) {
      it(`${name}@${version} renders its example.md to a valid PDF`, async () => {
        const examplePath = path.join(REAL_QUILLS_DIR, name, version, 'example.md');
        const content = await readFile(examplePath, 'utf8');

        const strategy = new RenderAndHostStrategy({
          outputDir,
          baseUrl: 'http://localhost/artifacts',
        });

        const result = await createDocument(registry, strategy, content);

        assert.equal(result.status, 'success', `render failed for ${name}: ${JSON.stringify(result.errors)}`);
        assert.match(result.url, /\.pdf$/);

        const filename = result.url.split('/').pop();
        const pdfPath = path.join(outputDir, filename);
        const pdfBytes = await readFile(pdfPath);
        assert.ok(pdfBytes.length > 0, `empty PDF for ${name}`);
        assert.equal(pdfBytes.subarray(0, 4).toString('ascii'), '%PDF', `bad PDF header for ${name}`);

        const info = await stat(pdfPath);
        assert.ok(info.size > 1000, `${name} PDF suspiciously small: ${info.size} bytes`);
      });
    }
  });

  /** @description Verifies package.json exports map: root, /primitives, /strategies, /mcp subpaths. */
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

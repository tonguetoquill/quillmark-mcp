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

import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';

import { createDefaultMCP } from '../src/index.js';
import { QuillmarkMCP } from '../src/mcp/index.js';
import { listQuills, getSpecs, createDocument } from '../src/primitives/index.js';
import { RenderAndHostStrategy } from '../src/strategies/index.js';

/** @constant {string} FIXTURE_QUIVER_DIR - Absolute path to the test Quiver fixture. */
const FIXTURE_QUIVER_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

/** @constant {string} REAL_QUIVER_DIR - Path to the shipped Quiver root (contains Quiver.yaml + quills/). */
const REAL_QUIVER_DIR = fileURLToPath(new URL('..', import.meta.url));

/** @constant {string[]} The seven quills shipped with the package. */
const SHIPPED_QUILLS = [
  { name: 'nyt_news_article', version: '0.1.0' },
  { name: 'cnn_news_article', version: '0.1.0' },
  { name: 'static_analysis_report', version: '0.1.0' },
  { name: 'usaf_memo', version: '0.2.0' },
  { name: 'x_post', version: '0.1.0' },
  { name: 'discord_chat', version: '0.1.0' },
  { name: 'usaf_intel_brief', version: '0.1.0' },
];

/**
 * Bootstraps a fresh Quiver+engine pair backed by the fixture directory.
 * @returns {Promise<{ quiver: object, engine: object }>}
 */
async function createFixtureCatalog() {
  init();
  const engine = new Quillmark();
  const quiver = await Quiver.fromDir(FIXTURE_QUIVER_DIR);
  return { quiver, engine };
}

/** @description Full integration suite — exercises primitives, factory, and package exports against real fixture data. */
describe('integration', () => {
  /** @description Walks the happy-path discovery flow: list -> specs -> render via a stub strategy. */
  it('supports cold-start discovery journey end-to-end', async () => {
    const { quiver, engine } = await createFixtureCatalog();
    const available = await listQuills(quiver, engine);

    assert.ok(available.some((quill) => quill.name === 'usaf_memo'));

    const specs = await getSpecs(quiver, engine, 'usaf_memo');
    assert.equal(typeof specs.schema, 'string');
    assert.ok(specs.schema.length > 0);
    assert.equal(specs.instructions, 'Keep tone formal.');

    const strategy = {
      async handle(quill, doc) {
        assert.equal(quill.metadata.schema.name, 'usaf_memo');
        assert.equal(doc.quillRef, 'usaf_memo');
        return { status: 'success', url: 'https://example.com/out.pdf' };
      },
    };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '---\nQUILL: usaf_memo\n---\n# Memo\n\nBody text.',
    );

    assert.deepStrictEqual(result, {
      status: 'success',
      url: 'https://example.com/out.pdf',
    });
  });

  /** @description Validates error handling: unknown quill, missing QUILL frontmatter. */
  it('covers primitive error paths', async () => {
    const { quiver, engine } = await createFixtureCatalog();

    await assert.rejects(() => getSpecs(quiver, engine, 'missing_quill'));

    const strategy = {
      async handle() {
        return { status: 'success', url: 'https://example.com' };
      },
    };

    const missingQuill = await createDocument(
      quiver,
      engine,
      strategy,
      '---\nTITLE: Memo\n---\nBody',
    );
    assert.deepStrictEqual(missingQuill, {
      status: 'error',
      errors: [{ message: 'QUILL: is required in frontmatter to select the Quill format.' }],
    });

    const unknownQuill = await createDocument(
      quiver,
      engine,
      strategy,
      '---\nQUILL: not_a_real_quill\n---\nBody',
    );
    assert.equal(unknownQuill.status, 'error');
    assert.match(unknownQuill.errors[0].message, /Unable to resolve Quill format reference "not_a_real_quill"/);
  });

  /** @description Ensures createDefaultMCP returns a QuillmarkMCP with a working catalog and the provided strategy. */
  it('createDefaultMCP wires up the default stack against real fixtures', async () => {
    const strategy = {
      async handle() {
        return { status: 'success' };
      },
    };
    const mcp = await createDefaultMCP({ quiverDir: FIXTURE_QUIVER_DIR, strategy });

    assert.ok(mcp instanceof QuillmarkMCP);
    assert.equal(mcp.strategy, strategy);
    assert.ok(typeof mcp.quiver.getQuill === 'function');
    assert.ok(typeof mcp.engine.quill === 'function');
  });

  /** @description End-to-end render proof for every shipped quill. */
  describe('shipped quills render end-to-end', () => {
    let outputDir;
    let quiver;
    let engine;

    before(async () => {
      outputDir = await mkdtemp(path.join(tmpdir(), 'quillmark-integration-'));
      init();
      engine = new Quillmark();
      quiver = await Quiver.fromDir(REAL_QUIVER_DIR);
    });

    after(async () => {
      await rm(outputDir, { recursive: true, force: true });
    });

    for (const { name, version } of SHIPPED_QUILLS) {
      it(`${name}@${version} renders its example.md to a valid PDF`, async () => {
        const examplePath = path.join(REAL_QUIVER_DIR, 'quills', name, version, 'example.md');
        const content = await readFile(examplePath, 'utf8');

        const strategy = new RenderAndHostStrategy({
          outputDir,
          baseUrl: 'http://localhost/artifacts',
        });

        const result = await createDocument(quiver, engine, strategy, content);

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
    assert.equal(typeof createDefaultMCP, 'function');

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

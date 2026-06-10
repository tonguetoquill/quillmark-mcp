import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { Engine, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';

import { createDefaultMCP } from '../src/index.js';
import { QuillmarkMCP } from '../src/mcp/index.js';
import { listQuills, getSpec, createDocument } from '../src/primitives/index.js';
import { RenderAndHostStrategy } from '../src/strategies/index.js';

const FIXTURE_QUIVER_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const REAL_QUIVER_DIR = fileURLToPath(new URL('../quiver', import.meta.url));

const SHIPPED_QUILLS = [
  { name: 'nyt_news_article', version: '0.2.0' },
  { name: 'cnn_news_article', version: '0.2.0' },
  { name: 'static_analysis_report', version: '0.2.0' },
  { name: 'usaf_memo', version: '0.3.0' },
  { name: 'x_post', version: '0.2.0' },
  { name: 'discord_chat', version: '0.2.0' },
  { name: 'usaf_intel_brief', version: '0.2.0' },
];

async function createFixtureCatalog() {
  init();
  const engine = new Engine();
  const quiver = await Quiver.fromDir(FIXTURE_QUIVER_DIR);
  return { quiver, engine };
}

describe('integration', () => {
  it('supports cold-start discovery journey end-to-end', async () => {
    const { quiver, engine } = await createFixtureCatalog();
    const available = await listQuills(quiver, engine);

    const fixtureMemo = available.find((quill) => quill.name === 'usaf_memo');
    assert.ok(fixtureMemo, 'usaf_memo should appear in the catalog');
    assert.equal(fixtureMemo.description, 'USAF memo fixture');
    assert.equal(typeof fixtureMemo.version, 'string');

    const specs = await getSpec(quiver, engine, 'usaf_memo');
    assert.equal(typeof specs.instruction, 'string');
    assert.ok(specs.instruction.length > 0);
    assert.equal(typeof specs.blueprint, 'string');

    const strategy = {
      async handle(quill, doc) {
        assert.equal(quill.metadata.name, 'usaf_memo');
        assert.equal(doc.quillRef, 'usaf_memo');
        return { url: 'https://example.com/out.pdf', mimeType: 'application/pdf' };
      },
    };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$quill: usaf_memo\n$kind: main\n~~~\n# Memo\n\nBody text.',
    );

    assert.deepStrictEqual(result, {
      ok: true,
      url: 'https://example.com/out.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('covers primitive error paths', async () => {
    const { quiver, engine } = await createFixtureCatalog();

    await assert.rejects(() => getSpec(quiver, engine, 'missing_quill'));

    const strategy = {
      async handle() {
        return { url: 'https://example.com', mimeType: 'application/pdf' };
      },
    };

    const missingQuill = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$kind: main\ntitle: Memo\n~~~\nBody',
    );
    assert.equal(missingQuill.ok, false);
    assert.match(missingQuill.message, /\$quill: <name> is required/);

    const unknownQuill = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$quill: not_a_real_quill\n$kind: main\n~~~\nBody',
    );
    assert.equal(unknownQuill.ok, false);
    assert.match(unknownQuill.message, /Unable to resolve Quill format reference "not_a_real_quill"/);
  });

  it('createDefaultMCP wires up the default stack against real fixtures', async () => {
    const strategy = {
      async handle() {
        return { url: 'stub', mimeType: 'application/pdf' };
      },
    };
    const mcp = await createDefaultMCP({ quiverDir: FIXTURE_QUIVER_DIR, strategy });

    assert.ok(mcp instanceof QuillmarkMCP);
    assert.equal(mcp.strategy, strategy);
    assert.ok(typeof mcp.quiver.getQuill === 'function');
    assert.ok(typeof mcp.engine.render === 'function');
  });

  describe('shipped quills render end-to-end', () => {
    let outputDir;
    let quiver;
    let engine;

    before(async () => {
      outputDir = await mkdtemp(path.join(tmpdir(), 'quillmark-integration-'));
      init();
      engine = new Engine();
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

        assert.equal(result.ok, true, `render failed for ${name}: ${result.message}`);
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

  it('exposes root and subpath exports', async () => {
    assert.equal(typeof createDefaultMCP, 'function');

    const root = await import('quillmark-mcp');
    assert.equal(typeof root.createDefaultMCP, 'function');

    const primitives = await import('quillmark-mcp/primitives');
    assert.equal(typeof primitives.listQuills, 'function');
    assert.equal(typeof primitives.getSpec, 'function');
    assert.equal(typeof primitives.createDocument, 'function');

    const strategies = await import('quillmark-mcp/strategies');
    assert.equal(typeof strategies.DeliveryStrategy, 'function');
    assert.equal(typeof strategies.RenderAndHostStrategy, 'function');

    const mcpModule = await import('quillmark-mcp/mcp');
    assert.equal(typeof mcpModule.QuillmarkMCP, 'function');
    assert.equal(typeof mcpModule.createDefaultMCP, 'function');
  });
});

/**
 * @module integration.test
 * @description Integration tests for the consumer surface. The library
 * (@quillmark/mcp) is now responsible for the parse → resolve → validate →
 * deliver pipeline; these tests cover what *turnkey* owns: the deliverer
 * shape, the createDefaultMCP factory wiring, and end-to-end rendering of
 * every shipped quill via createRenderAndHostDeliverer.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';
import { createDocument, listQuills, getSpecs } from '@quillmark/mcp';

import { createDefaultMCP, createRenderAndHostDeliverer } from '../src/index.js';

const FIXTURE_QUIVER_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const REAL_QUIVER_DIR = fileURLToPath(new URL('../quiver', import.meta.url));

const SHIPPED_QUILLS = [
  { name: 'nyt_news_article', version: '0.1.0' },
  { name: 'cnn_news_article', version: '0.1.0' },
  { name: 'static_analysis_report', version: '0.1.0' },
  { name: 'usaf_memo', version: '0.2.0' },
  { name: 'x_post', version: '0.1.0' },
  { name: 'discord_chat', version: '0.1.0' },
  { name: 'usaf_intel_brief', version: '0.1.0' },
];

async function createFixtureCatalog() {
  init();
  const engine = new Quillmark();
  const quiver = await Quiver.fromDir(FIXTURE_QUIVER_DIR);
  return { quiver, engine };
}

describe('integration', () => {
  it('cold-start discovery → delivery via the library primitives', async () => {
    const { quiver, engine } = await createFixtureCatalog();
    const list = await listQuills(quiver, engine);
    const fixtureMemo = list.quills.find((q) => q.name === 'usaf_memo');
    assert.ok(fixtureMemo, 'usaf_memo should appear in the catalog');
    assert.equal(fixtureMemo.description, 'USAF memo fixture');

    const specs = await getSpecs(quiver, engine, 'usaf_memo');
    assert.equal(typeof specs.schema, 'string');
    assert.ok(specs.schema.length > 0);

    const deliver = async ({ doc, canonicalRef, metadata }) => {
      assert.equal(metadata.schema.name, 'usaf_memo');
      assert.equal(doc.quillRef, 'usaf_memo');
      assert.match(canonicalRef, /^usaf_memo@/);
      return { status: 'success', url: 'https://example.com/out.pdf' };
    };

    const result = await createDocument(
      quiver,
      engine,
      deliver,
      '---\nQUILL: usaf_memo\n---\n# Memo\n\nBody text.',
    );

    assert.deepStrictEqual(result, {
      status: 'success',
      url: 'https://example.com/out.pdf',
    });
  });

  it('createDefaultMCP wires the default stack against real fixtures', async () => {
    const deliver = async () => ({ status: 'success' });
    const mcp = await createDefaultMCP({ quiverDir: FIXTURE_QUIVER_DIR, deliver });

    assert.equal(mcp.deliver, deliver);
    assert.ok(typeof mcp.quiver.getQuill === 'function');
    assert.ok(typeof mcp.engine.quill === 'function');
  });

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

        const deliver = createRenderAndHostDeliverer({
          outputDir,
          baseUrl: 'http://localhost/artifacts',
        });

        const result = await createDocument(quiver, engine, deliver, content);

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
});

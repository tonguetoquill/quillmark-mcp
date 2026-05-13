import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RenderAndHostStrategy } from '../../src/strategies/RenderAndHostStrategy.js';

function makeQuill({ name = 'test_quill', render }) {
  return {
    metadata: { name },
    render,
  };
}

const stubDoc = { quillRef: 'test_quill' };

describe('RenderAndHostStrategy', () => {
  it('initializes with configurable outputDir, baseUrl, and format', () => {
    const strategy = new RenderAndHostStrategy({
      outputDir: '/tmp/artifacts',
      baseUrl: 'https://cdn.example.com',
      format: 'svg',
    });

    assert.strictEqual(strategy.outputDir, '/tmp/artifacts');
    assert.strictEqual(strategy.baseUrl, 'https://cdn.example.com');
    assert.strictEqual(strategy.format, 'svg');
  });

  it('uses sensible defaults', () => {
    const strategy = new RenderAndHostStrategy();

    assert.match(strategy.outputDir, /\.artifacts$/);
    assert.strictEqual(strategy.baseUrl, 'file://');
    assert.strictEqual(strategy.format, 'pdf');
  });

  it('throws when quill.render throws', async () => {
    const strategy = new RenderAndHostStrategy();
    const quill = makeQuill({
      render: () => {
        throw new Error('render exploded');
      },
    });

    await assert.rejects(() => strategy.handle(quill, stubDoc), /render exploded/);
  });

  it('throws when render result has no artifacts', async () => {
    const strategy = new RenderAndHostStrategy();
    const quill = makeQuill({
      render: () => ({ artifacts: [] }),
    });

    await assert.rejects(() => strategy.handle(quill, stubDoc), /did not include any artifacts/);
  });

  it('writes artifact bytes to disk and returns { url, mimeType }', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'qm-strategy-'));
    try {
      const strategy = new RenderAndHostStrategy({ outputDir: dir });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const quill = makeQuill({
        render: () => ({ artifacts: [{ bytes, mimeType: 'application/pdf' }] }),
      });

      const result = await strategy.handle(quill, stubDoc);

      assert.equal(result.mimeType, 'application/pdf');
      assert.ok(result.url.startsWith('file://'));
      const written = await readFile(result.url.replace(/^file:\/\//, ''));
      assert.deepStrictEqual(Array.from(written), [1, 2, 3, 4]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('joins baseUrl + filename when baseUrl is HTTP', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'qm-strategy-'));
    try {
      const strategy = new RenderAndHostStrategy({ outputDir: dir, baseUrl: 'https://cdn.example.com/files/' });
      const quill = makeQuill({
        render: () => ({ artifacts: [{ bytes: new Uint8Array([0]), mimeType: 'application/pdf' }] }),
      });

      const result = await strategy.handle(quill, stubDoc);

      assert.match(result.url, /^https:\/\/cdn\.example\.com\/files\/test_quill-[0-9a-f-]+\.pdf$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * @module test/strategies/RenderAndHostStrategy
 * Tests for {@link RenderAndHostStrategy} — validates constructor option handling,
 * sensible defaults, render error propagation, and missing-artifact edge cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RenderAndHostStrategy } from '../../src/strategies/RenderAndHostStrategy.js';

/**
 * Minimal `Quill` test double exposing only what RenderAndHostStrategy uses:
 * `metadata.schema.name` for filename derivation and `render(doc, opts)`.
 */
function makeQuill({ name = 'test_quill', render }) {
  return {
    metadata: { schema: { name } },
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

  it('returns structured error when quill.render throws', async () => {
    const strategy = new RenderAndHostStrategy();
    const quill = makeQuill({
      render: () => {
        throw new Error('render exploded');
      },
    });

    const result = await strategy.handle(quill, stubDoc);

    assert.strictEqual(result.status, 'error');
    assert.deepStrictEqual(result.errors, [{ message: 'render exploded' }]);
  });

  it('returns structured error when render result has no artifacts', async () => {
    const strategy = new RenderAndHostStrategy();
    const quill = makeQuill({
      render: () => ({ artifacts: [] }),
    });

    const result = await strategy.handle(quill, stubDoc);

    assert.strictEqual(result.status, 'error');
    assert.deepStrictEqual(result.errors, [
      { message: 'Render result did not include any artifacts.' },
    ]);
  });
});

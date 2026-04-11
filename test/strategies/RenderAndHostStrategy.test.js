import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RenderAndHostStrategy } from '../../src/strategies/RenderAndHostStrategy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RenderAndHostStrategy', () => {
  it('initializes with configurable outputDir and baseUrl', () => {
    const strategy = new RenderAndHostStrategy({
      outputDir: '/tmp/artifacts',
      baseUrl: 'https://cdn.example.com',
      format: 'pdf',
    });

    assert.strictEqual(strategy.outputDir, '/tmp/artifacts');
    assert.strictEqual(strategy.baseUrl, 'https://cdn.example.com');
    assert.strictEqual(strategy.format, 'pdf');
    assert.ok(strategy.engine, 'engine should be initialized');
  });

  it('uses sensible defaults', () => {
    const strategy = new RenderAndHostStrategy();

    assert.match(strategy.outputDir, /\.artifacts$/);
    assert.strictEqual(strategy.baseUrl, 'file://');
    assert.strictEqual(strategy.format, 'pdf');
  });

  it('handles render errors gracefully', async () => {
    // Create a strategy that will fail during render by passing invalid content
    const strategy = new RenderAndHostStrategy();
    strategy.engine.registerQuill = () => {};

    // Passing empty/invalid content should cause Quillmark to fail
    const result = await strategy.handle({ name: 'test_quill', data: {} }, '');

    assert.strictEqual(result.status, 'error');
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors[0].message);
  });

  it('handles missing artifacts in render result gracefully', async () => {
    const strategy = new RenderAndHostStrategy();

    // Override engine methods to isolate artifact-handling logic
    strategy.engine.registerQuill = () => {};
    strategy.engine.render = () => ({
      artifacts: [],
    });

    const result = await strategy.handle({ name: 'test_quill', data: {} }, '---\nQUILL: test\n---\nBody');

    assert.strictEqual(result.status, 'error');
    assert.deepStrictEqual(result.errors, [
      { message: 'Render result did not include any artifacts.' },
    ]);
  });
});

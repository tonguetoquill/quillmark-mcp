import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PassThroughStrategy } from '../../src/strategies/PassThroughStrategy.js';

describe('PassThroughStrategy', () => {
  it('calls the injected handler with quill and content', async () => {
    let captured;
    const strategy = new PassThroughStrategy(async (quill, content) => {
      captured = { quill, content };
      return { status: 'success', url: 'https://example.com/doc.pdf' };
    });

    const quill = { name: 'usaf_memo' };
    const content = '---\nQUILL: usaf_memo\n---\nBody';

    await strategy.handle(quill, content);

    assert.deepStrictEqual(captured, { quill, content });
  });

  it('returns the handler result', async () => {
    const expected = { status: 'success', url: 'https://example.com/result.pdf' };
    const strategy = new PassThroughStrategy(() => expected);

    const actual = await strategy.handle({ name: 'q' }, 'content');

    assert.deepStrictEqual(actual, expected);
  });

  it('propagates handler errors', async () => {
    const strategy = new PassThroughStrategy(async () => {
      throw new Error('handler failed');
    });

    await assert.rejects(() => strategy.handle({ name: 'q' }, 'content'), /handler failed/);
  });
});

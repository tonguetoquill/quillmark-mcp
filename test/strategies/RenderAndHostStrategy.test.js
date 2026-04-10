import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RenderAndHostStrategy } from '../../src/strategies/RenderAndHostStrategy.js';

describe('RenderAndHostStrategy', () => {
  it('renders content and returns a URL', async () => {
    const strategy = new RenderAndHostStrategy({
      renderDocument({ quill, content, format }) {
        assert.strictEqual(quill.name, 'usaf_memo');
        assert.strictEqual(content, 'validated content');
        assert.strictEqual(format, 'pdf');

        return {
          artifacts: [
            {
              bytes: Uint8Array.from([37, 80, 68, 70]),
              mimeType: 'application/pdf',
            },
          ],
        };
      },
      saveArtifact({ quill, format }) {
        assert.strictEqual(quill.name, 'usaf_memo');
        assert.strictEqual(format, 'pdf');
        return { url: 'https://cdn.example.com/usaf_memo.pdf' };
      },
    });

    const result = await strategy.handle({ name: 'usaf_memo' }, 'validated content');

    assert.deepStrictEqual(result, {
      status: 'success',
      url: 'https://cdn.example.com/usaf_memo.pdf',
    });
  });

  it('handles render errors gracefully', async () => {
    const strategy = new RenderAndHostStrategy({
      renderDocument() {
        throw new Error('render failed');
      },
    });

    const result = await strategy.handle({ name: 'usaf_memo' }, 'validated content');

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'render failed' }],
    });
  });
});

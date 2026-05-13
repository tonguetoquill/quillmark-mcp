import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listQuills } from '../../src/primitives/listQuills.js';

const STUB_ENGINE = {};

function makeQuiver({ names = () => [], getQuill = async () => ({ metadata: {} }) } = {}) {
  return { quillNames: names, getQuill };
}

describe('listQuills', () => {
  it('returns name + version + description pulled from each quill metadata', async () => {
    const quiver = makeQuiver({
      names: () => ['usaf_memo', 'sitrep'],
      getQuill: async (name) => ({
        metadata: {
          version: name === 'usaf_memo' ? '1.0.0' : '0.1.0',
          description: name === 'usaf_memo' ? 'USAF memo format' : 'Situation report',
        },
      }),
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.deepStrictEqual(result, [
      { name: 'usaf_memo', version: '1.0.0', description: 'USAF memo format' },
      { name: 'sitrep', version: '0.1.0', description: 'Situation report' },
    ]);
  });

  it('returns empty array when quiver has no quills', async () => {
    const quiver = makeQuiver({ names: () => [] });
    assert.deepStrictEqual(await listQuills(quiver, STUB_ENGINE), []);
  });

  it('returns empty array when quillNames() throws', async () => {
    const quiver = makeQuiver({ names: () => { throw new Error('source unavailable'); } });
    assert.deepStrictEqual(await listQuills(quiver, STUB_ENGINE), []);
  });

  it('isolates per-quill failures so one broken quill does not collapse the listing', async () => {
    const quiver = makeQuiver({
      names: () => ['ok', 'broken', 'also_ok'],
      getQuill: async (name) => {
        if (name === 'broken') throw new Error('load failed');
        return { metadata: { version: '1.0.0', description: `desc-${name}` } };
      },
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.deepStrictEqual(result, [
      { name: 'ok', version: '1.0.0', description: 'desc-ok' },
      { name: 'broken', version: '', description: '' },
      { name: 'also_ok', version: '1.0.0', description: 'desc-also_ok' },
    ]);
  });

  it('normalizes missing or non-string metadata fields to empty strings', async () => {
    const quiver = makeQuiver({
      names: () => ['no_metadata', 'no_description', 'numeric_description'],
      getQuill: async (name) => {
        if (name === 'no_metadata') return {};
        if (name === 'no_description') return { metadata: { version: '1.0.0' } };
        return { metadata: { version: '1.0.0', description: 42 } };
      },
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.deepStrictEqual(result, [
      { name: 'no_metadata', version: '', description: '' },
      { name: 'no_description', version: '1.0.0', description: '' },
      { name: 'numeric_description', version: '1.0.0', description: '' },
    ]);
  });
});

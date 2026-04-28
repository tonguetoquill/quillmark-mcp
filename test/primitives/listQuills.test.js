/**
 * @module test/primitives/listQuills
 *
 * Tests for the {@link listQuills} primitive.
 *
 * Covers:
 * - Projection of quill names + descriptions from materialized Quill metadata
 * - Empty quiver handling (returns [])
 * - Quiver error resilience (returns [])
 * - Per-quill failure isolation (broken quill yields empty description)
 * - Missing description normalization
 *
 * Stubs: a fake `quiver` exposing `quillNames()` and `getQuill(name, { engine })`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listQuills } from '../../src/primitives/listQuills.js';

const STUB_ENGINE = {};

function makeQuiver({ names = () => [], getQuill = async () => ({ metadata: { schema: { main: {} } } }) } = {}) {
  return { quillNames: names, getQuill };
}

describe('listQuills', () => {
  it('returns name + description pulled from each quill metadata', async () => {
    const quiver = makeQuiver({
      names: () => ['usaf_memo', 'sitrep'],
      getQuill: async (name) => ({
        metadata: {
          schema: {
            name,
            main: {
              description:
                name === 'usaf_memo' ? 'USAF memo format' : 'Situation report',
            },
          },
        },
      }),
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.deepStrictEqual(result, [
      { name: 'usaf_memo', description: 'USAF memo format' },
      { name: 'sitrep', description: 'Situation report' },
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
        return {
          metadata: { schema: { main: { description: `desc-${name}` } } },
        };
      },
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.deepStrictEqual(result, [
      { name: 'ok', description: 'desc-ok' },
      { name: 'broken', description: '' },
      { name: 'also_ok', description: 'desc-also_ok' },
    ]);
  });

  it('normalizes missing or non-string descriptions to empty strings', async () => {
    const quiver = makeQuiver({
      names: () => ['no_main', 'no_description', 'numeric_description'],
      getQuill: async (name) => {
        if (name === 'no_main') return { metadata: { schema: {} } };
        if (name === 'no_description') return { metadata: { schema: { main: {} } } };
        return { metadata: { schema: { main: { description: 42 } } } };
      },
    });

    const result = await listQuills(quiver, STUB_ENGINE);

    assert.ok(result.every((entry) => typeof entry.description === 'string'));
    assert.deepStrictEqual(result, [
      { name: 'no_main', description: '' },
      { name: 'no_description', description: '' },
      { name: 'numeric_description', description: '' },
    ]);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listQuills } from '../../src/primitives/listQuills.js';

describe('listQuills', () => {
  it('returns quill metadata from a populated registry', async () => {
    const registry = {
      async getAvailableQuills() {
        return [
          { name: 'usaf_memo', description: 'USAF memo format', version: '1.0.0' },
          { name: 'sitrep', description: 'Situation report', version: '2.0.0' },
        ];
      },
    };

    const result = await listQuills(registry);

    assert.deepStrictEqual(result, [
      { name: 'usaf_memo', description: 'USAF memo format' },
      { name: 'sitrep', description: 'Situation report' },
    ]);
  });

  it('returns empty array when registry has no quills', async () => {
    const registry = {
      async getAvailableQuills() {
        return [];
      },
    };

    const result = await listQuills(registry);

    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when registry throws', async () => {
    const registry = {
      async getAvailableQuills() {
        throw new Error('source unavailable');
      },
    };

    const result = await listQuills(registry);

    assert.deepStrictEqual(result, []);
  });

  it('always returns items with string name and description', async () => {
    const registry = {
      async getAvailableQuills() {
        return [
          { name: 'a', description: 'desc' },
          { name: 'b' },
          { name: 'c', description: null },
          { name: 'd', description: 42 },
          { name: 'e', description: { text: 'nope' } },
        ];
      },
    };

    const result = await listQuills(registry);

    assert.strictEqual(typeof result[0].name, 'string');
    assert.strictEqual(typeof result[0].description, 'string');
    assert.strictEqual(typeof result[1].name, 'string');
    assert.strictEqual(typeof result[1].description, 'string');
    assert.strictEqual(result[1].name, 'b');
    assert.strictEqual(result[1].description, '');
    assert.strictEqual(result[2].description, '');
    assert.strictEqual(result[3].description, '');
    assert.strictEqual(result[4].description, '');
  });
});

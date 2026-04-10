import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke', () => {
  it('node:test runner works', () => {
    assert.strictEqual(1 + 1, 2);
  });
});

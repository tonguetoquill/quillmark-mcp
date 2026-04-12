/**
 * @module test/smoke
 * Minimal smoke test validating the Node.js built-in test runner is functional.
 * Acts as a canary — if this fails, the test harness itself is broken.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke', () => {
  it('node:test runner works', () => {
    assert.strictEqual(1 + 1, 2);
  });
});

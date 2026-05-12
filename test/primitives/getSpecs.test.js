/**
 * @module test/primitives/getSpecs
 *
 * Tests for the {@link getSpecs} primitive.
 *
 * Covers:
 * - Happy path: resolves ref, returns instruction and blueprint
 * - Error propagation for unknown/invalid quill refs
 * - Error propagation when the quiver itself fails
 * - Blueprint passthrough (returned verbatim)
 * - Empty blueprint when blueprint is absent
 *
 * Stubs: a fake `quiver` with `getQuill()` returning a stub `quill` whose
 * shape mirrors `@quillmark/wasm` 0.77.0 (`schema`, `blueprint`, `metadata`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getSpecs } from '../../src/primitives/getSpecs.js';

const STUB_ENGINE = {};

function makeQuiver(getQuillImpl) {
  return { getQuill: getQuillImpl };
}

describe('getSpecs', () => {
  it('returns instruction and blueprint for a valid ref', async () => {
    const expectedBlueprint = 'Write a formal memo. Use concise language.';
    const quiver = makeQuiver(async (ref, opts) => {
      assert.strictEqual(ref, 'usaf_memo');
      assert.strictEqual(opts.engine, STUB_ENGINE);
      return {
        schema: { main: { fields: { title: { type: 'string' } } } },
        blueprint: expectedBlueprint,
        metadata: { name: 'usaf_memo' },
      };
    });

    const result = await getSpecs(quiver, STUB_ENGINE, 'usaf_memo');

    assert.strictEqual(result.blueprint, expectedBlueprint);
    assert.ok(typeof result.instruction === 'string' && result.instruction.length > 0);
    assert.ok(result.instruction.includes('usaf_memo'));
    assert.ok(result.instruction.includes('create_document'));
  });

  it('throws for an invalid or unknown ref', async () => {
    const quiver = makeQuiver(async () => {
      throw new Error('quill_not_found');
    });

    await assert.rejects(
      () => getSpecs(quiver, STUB_ENGINE, 'unknown_quill'),
      /Unable to resolve Quill format reference "unknown_quill": quill_not_found/,
    );
  });

  it('throws when the quiver itself errors', async () => {
    const quiver = makeQuiver(async () => {
      throw new Error('source unavailable');
    });

    await assert.rejects(
      () => getSpecs(quiver, STUB_ENGINE, 'usaf_memo'),
      /source unavailable/,
    );
  });

  it('returns empty string blueprint when blueprint is absent', async () => {
    const quiver = makeQuiver(async () => ({
      schema: { main: { fields: {} } },
      blueprint: undefined,
      metadata: { name: 'sitrep' },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep');

    assert.strictEqual(result.blueprint, '');
  });

  it('passes blueprint through verbatim', async () => {
    const blueprint = 'Write in plain language.\nKeep headings short.';
    const quiver = makeQuiver(async () => ({
      schema: { main: { fields: {} } },
      blueprint,
      metadata: { name: 'sitrep' },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep');

    assert.strictEqual(result.blueprint, blueprint);
  });
});

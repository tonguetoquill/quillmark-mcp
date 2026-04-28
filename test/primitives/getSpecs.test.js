/**
 * @module test/primitives/getSpecs
 *
 * Tests for the {@link getSpecs} primitive.
 *
 * Covers:
 * - Happy path: resolves ref, encodes schema via TOON encoder, returns instructions
 * - Error propagation for unknown/invalid quill refs
 * - Error propagation when the quiver itself fails
 * - Instructions passthrough (returned verbatim, no trimming)
 * - Schema fallback when only metadata.schema is present (no example)
 *
 * Stubs: a fake `quiver` with `getQuill()` returning a stub `quill` whose
 * `metadata` mirrors the shape from `@quillmark/wasm` (`metadata.schema`,
 * `metadata.instructions`, etc.).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getSpecs } from '../../src/primitives/getSpecs.js';

const STUB_ENGINE = {};

function makeQuiver(getQuillImpl) {
  return { getQuill: getQuillImpl };
}

describe('getSpecs', () => {
  it('returns TOON-encoded schema and instructions for a valid ref', async () => {
    const expectedSchema = {
      name: 'usaf_memo',
      main: { fields: { title: { type: 'string' } } },
      example: 'Use concise language.',
    };
    const quiver = makeQuiver(async (ref, opts) => {
      assert.strictEqual(ref, 'usaf_memo');
      assert.strictEqual(opts.engine, STUB_ENGINE);
      return { metadata: { schema: expectedSchema } };
    });

    let encodedInput;
    const result = await getSpecs(quiver, STUB_ENGINE, 'usaf_memo', {
      encodeSchema(input) {
        encodedInput = input;
        return 'toon-schema';
      },
    });

    assert.deepStrictEqual(encodedInput, expectedSchema);
    assert.deepStrictEqual(result, {
      schema: 'toon-schema',
      instructions: 'Use concise language.',
    });
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

  it('passes through metadata.instructions when no schema example is present', async () => {
    const rawInstructions = 'Keep headings short.\nDo not alter this wording.  ';
    const quiver = makeQuiver(async () => ({
      metadata: {
        schema: { name: 'sitrep', main: { fields: {} } },
        instructions: rawInstructions,
      },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep', {
      encodeSchema() {
        return 'encoded';
      },
    });

    assert.strictEqual(result.instructions, rawInstructions);
  });

  it('prefers metadata.schema.example over metadata.instructions', async () => {
    const quiver = makeQuiver(async () => ({
      metadata: {
        schema: { name: 'sitrep', main: { fields: {} }, example: 'Follow the sample.' },
        instructions: 'Should NOT be returned.',
      },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep', {
      encodeSchema() {
        return 'encoded';
      },
    });

    assert.strictEqual(result.instructions, 'Follow the sample.');
  });

  it('throws when no schema is exposed by the quill metadata', async () => {
    const quiver = makeQuiver(async () => ({ metadata: {} }));

    await assert.rejects(
      () => getSpecs(quiver, STUB_ENGINE, 'broken'),
      /did not expose a schema/,
    );
  });
});

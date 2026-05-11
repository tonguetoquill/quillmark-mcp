/**
 * @module test/primitives/getSpecs
 *
 * Tests for the {@link getSpecs} primitive.
 *
 * Covers:
 * - Happy path: resolves ref, encodes schema via TOON encoder, returns blueprint as instructions
 * - Error propagation for unknown/invalid quill refs
 * - Error propagation when the quiver itself fails
 * - Blueprint passthrough (returned verbatim as instructions)
 * - Empty instructions when blueprint is absent
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
  it('returns TOON-encoded schema and blueprint as instructions for a valid ref', async () => {
    const expectedSchema = {
      main: { fields: { title: { type: 'string' } } },
    };
    const expectedBlueprint = 'Write a formal memo. Use concise language.';
    const quiver = makeQuiver(async (ref, opts) => {
      assert.strictEqual(ref, 'usaf_memo');
      assert.strictEqual(opts.engine, STUB_ENGINE);
      return {
        schema: expectedSchema,
        blueprint: expectedBlueprint,
        metadata: { name: 'usaf_memo' },
      };
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
      instructions: expectedBlueprint,
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

  it('returns empty string instructions when blueprint is absent', async () => {
    const quiver = makeQuiver(async () => ({
      schema: { main: { fields: {} } },
      blueprint: undefined,
      metadata: { name: 'sitrep' },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep', {
      encodeSchema() {
        return 'encoded';
      },
    });

    assert.strictEqual(result.instructions, '');
  });

  it('passes blueprint through verbatim as instructions', async () => {
    const blueprint = 'Write in plain language.\nKeep headings short.';
    const quiver = makeQuiver(async () => ({
      schema: { main: { fields: {} } },
      blueprint,
      metadata: { name: 'sitrep' },
    }));

    const result = await getSpecs(quiver, STUB_ENGINE, 'sitrep', {
      encodeSchema() {
        return 'encoded';
      },
    });

    assert.strictEqual(result.instructions, blueprint);
  });

  it('throws when no schema is exposed by the quill', async () => {
    const quiver = makeQuiver(async () => ({ metadata: {}, blueprint: '' }));

    await assert.rejects(
      () => getSpecs(quiver, STUB_ENGINE, 'broken'),
      /did not expose a schema/,
    );
  });
});

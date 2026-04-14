/**
 * @module test/primitives/getSpecs
 *
 * Tests for the {@link getSpecs} primitive.
 *
 * Covers:
 * - Happy path: resolves ref, encodes schema via TOON encoder, returns instructions
 * - Error propagation for unknown/invalid quill refs
 * - Error propagation when the registry itself fails
 * - Instructions passthrough (returned verbatim, no trimming)
 *
 * Stubs: registry (resolve, engine.getQuillSchema, engine.getQuillInfo) and
 * an optional TOON encoder ({ encodeSchema }) passed as the third argument.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getSpecs } from '../../src/primitives/getSpecs.js';

describe('getSpecs', () => {
  it('returns TOON-encoded schema and instructions for a valid ref', async () => {
    const expectedSchema = { name: 'usaf_memo', fields: { title: { type: 'string' } } };
    const registry = {
      async resolve(ref) {
        assert.strictEqual(ref, 'usaf_memo');
        return { name: 'usaf_memo' };
      },
      engine: {
        getQuillSchema(name) {
          assert.strictEqual(name, 'usaf_memo');
          return 'name: usaf_memo\nfields:\n  title:\n    type: string\n';
        },
        getQuillInfo(name) {
          assert.strictEqual(name, 'usaf_memo');
          return { example: 'Use concise language.' };
        },
      },
    };

    let encodedInput;
    const result = await getSpecs(registry, 'usaf_memo', {
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
    const registry = {
      async resolve() {
        throw new Error('quill_not_found');
      },
      engine: {
        getQuillSchema() {
          return 'name: x\nfields: {}\n';
        },
        getQuillInfo() {
          return { example: '' };
        },
      },
    };

    await assert.rejects(
      () => getSpecs(registry, 'unknown_quill'),
      /Unable to resolve Quill format reference "unknown_quill": quill_not_found/,
    );
  });

  it('throws when registry itself errors', async () => {
    const registry = {
      async resolve() {
        throw new Error('source unavailable');
      },
      engine: {
        getQuillSchema() {
          return 'name: x\nfields: {}\n';
        },
        getQuillInfo() {
          return { example: '' };
        },
      },
    };

    await assert.rejects(
      () => getSpecs(registry, 'usaf_memo'),
      /source unavailable/,
    );
  });

  it('passes through instructions unmodified', async () => {
    const rawInstructions = 'Keep headings short.\nDo not alter this wording.  ';
    const registry = {
      async resolve() {
        return { name: 'sitrep' };
      },
      engine: {
        getQuillSchema() {
          return 'name: sitrep\nfields: {}\n';
        },
        getQuillInfo() {
          return { example: rawInstructions };
        },
      },
    };

    const result = await getSpecs(registry, 'sitrep', {
      encodeSchema() {
        return 'encoded';
      },
    });

    assert.strictEqual(result.instructions, rawInstructions);
  });

  it('falls back to getQuillInfo().schema when getQuillSchema() is unavailable', async () => {
    const registry = {
      async resolve() {
        return { name: 'sitrep' };
      },
      engine: {
        getQuillInfo() {
          return {
            schema: 'name: sitrep\nfields:\n  title:\n    type: string\n',
            example: 'Follow the sample.',
          };
        },
      },
    };

    let encodedInput;
    const result = await getSpecs(registry, 'sitrep', {
      encodeSchema(input) {
        encodedInput = input;
        return 'encoded';
      },
    });

    assert.deepStrictEqual(encodedInput, {
      name: 'sitrep',
      fields: { title: { type: 'string' } },
    });
    assert.deepStrictEqual(result, { schema: 'encoded', instructions: 'Follow the sample.' });
  });
});

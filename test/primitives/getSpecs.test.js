import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getSpecs } from '../../src/primitives/getSpecs.js';

describe('getSpecs', () => {
  it('returns TOON-encoded schema and instructions for a valid ref', async () => {
    const schema = { type: 'object', properties: { title: { type: 'string' } } };
    const registry = {
      async resolve(ref) {
        assert.strictEqual(ref, 'usaf_memo');
        return { name: 'usaf_memo' };
      },
      engine: {
        getStrippedSchema(name) {
          assert.strictEqual(name, 'usaf_memo');
          return schema;
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

    assert.deepStrictEqual(encodedInput, schema);
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
        getStrippedSchema() {
          return {};
        },
        getQuillInfo() {
          return { example: '' };
        },
      },
    };

    await assert.rejects(
      () => getSpecs(registry, 'unknown_quill'),
      /Unable to resolve quill reference "unknown_quill": quill_not_found/,
    );
  });

  it('throws when registry itself errors', async () => {
    const registry = {
      async resolve() {
        throw new Error('source unavailable');
      },
      engine: {
        getStrippedSchema() {
          return {};
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
        getStrippedSchema() {
          return { type: 'object' };
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
});

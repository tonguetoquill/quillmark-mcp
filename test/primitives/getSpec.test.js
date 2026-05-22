import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getSpecs } from '../../src/primitives/getSpec.js';

const STUB_ENGINE = {};

function makeQuiver(getQuillImpl, quillNames) {
  const quiver = { getQuill: getQuillImpl };
  if (quillNames) quiver.quillNames = () => quillNames;
  return quiver;
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

  it('rejects empty string refs', async () => {
    const quiver = makeQuiver(async () => assert.fail('should not call'));
    await assert.rejects(() => getSpecs(quiver, STUB_ENGINE, '   '), /non-empty string/);
  });

  it('includes available quill names when ref cannot be resolved', async () => {
    const quiver = makeQuiver(
      async () => { throw new Error('not found'); },
      ['usaf_memo', 'nyt_news_article'],
    );
    await assert.rejects(
      () => getSpecs(quiver, STUB_ENGINE, 'bogus'),
      /Available quills: usaf_memo, nyt_news_article/,
    );
  });

  it('instruction leads with format rules warning', async () => {
    const quiver = makeQuiver(async () => ({ blueprint: '', metadata: { name: 'usaf_memo' } }));
    const result = await getSpecs(quiver, STUB_ENGINE, 'usaf_memo');
    assert.match(result.instruction, /Document format rules/);
    assert.match(result.instruction, /~~~card-yaml/);
    assert.match(result.instruction, /NOT.*---|---.*frontmatter/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDocument } from '../../src/primitives/createDocument.js';

const VALID_CONTENT = `---
QUILL: usaf_memo
---
# Memo`;

describe('createDocument', () => {
  it('strips double-quoted QUILL scalars (YAML-encoded via compose_document path)', async () => {
    const quotedContent = `---\nQUILL: "usaf_memo@0.2.0"\n---\n# Memo`;
    let resolvedWith;
    const registry = {
      async resolve(ref) {
        resolvedWith = ref;
        return { name: 'usaf_memo', version: '0.2.0' };
      },
      engine: { dryRun() {} },
    };
    const strategy = { async handle() { return { status: 'success', url: 'x' }; } };
    const result = await createDocument(registry, strategy, quotedContent);
    assert.equal(result.status, 'success');
    assert.equal(resolvedWith, 'usaf_memo@0.2.0', 'QUILL quotes not stripped');
  });

  it('strips single-quoted QUILL scalars as well', async () => {
    const quotedContent = `---\nQUILL: 'usaf_memo'\n---\n# Memo`;
    let resolvedWith;
    const registry = {
      async resolve(ref) {
        resolvedWith = ref;
        return { name: 'usaf_memo' };
      },
      engine: { dryRun() {} },
    };
    const strategy = { async handle() { return { status: 'success', url: 'x' }; } };
    await createDocument(registry, strategy, quotedContent);
    assert.equal(resolvedWith, 'usaf_memo');
  });

  it('returns strategy result for valid content', async () => {
    const quill = { name: 'usaf_memo', version: '1.0.0' };
    const registry = {
      async resolve(ref) {
        assert.strictEqual(ref, 'usaf_memo');
        return quill;
      },
      engine: {
        dryRun(content) {
          assert.strictEqual(content, VALID_CONTENT);
        },
      },
    };

    const strategyResult = { status: 'success', url: 'https://example.com/doc.pdf' };
    const strategy = {
      async handle(resolvedQuill, validatedContent) {
        assert.strictEqual(resolvedQuill, quill);
        assert.strictEqual(validatedContent, VALID_CONTENT);
        return strategyResult;
      },
    };

    const result = await createDocument(registry, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, strategyResult);
  });

  it('returns structured error when QUILL field is missing', async () => {
    const registry = {
      async resolve() {
        throw new Error('should not be called');
      },
    };

    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(registry, strategy, '---\ntitle: memo\n---\n# Memo');

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'QUILL: is required in frontmatter to select the Quill format.' }],
    });
  });

  it('returns structured error for invalid quill ref', async () => {
    const registry = {
      async resolve() {
        throw new Error('quill_not_found');
      },
      engine: {
        dryRun() {},
      },
    };

    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(registry, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'Unable to resolve Quill format reference "usaf_memo": quill_not_found' }],
    });
  });

  it('returns validation errors when dryRun fails', async () => {
    const registry = {
      async resolve() {
        return { name: 'usaf_memo' };
      },
      engine: {
        dryRun() {
          throw new Error('field "recipient" is required');
        },
      },
    };

    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(registry, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'field "recipient" is required' }],
    });
  });

  it('delegates to strategy.handle with resolved quill and validated content', async () => {
    const resolvedQuill = { name: 'usaf_memo' };
    const calls = [];

    const registry = {
      async resolve() {
        return resolvedQuill;
      },
      engine: {
        dryRun() {},
      },
    };

    const strategy = {
      async handle(quill, validatedContent) {
        calls.push({ quill, validatedContent });
        return { status: 'success', url: 'https://example.com/out.pdf' };
      },
    };

    await createDocument(registry, strategy, VALID_CONTENT);

    assert.deepStrictEqual(calls, [
      {
        quill: resolvedQuill,
        validatedContent: VALID_CONTENT,
      },
    ]);
  });

  it('formats Map validation errors from dryRun', async () => {
    const errorMap = new Map([
      ['recipient', 'is required'],
      ['subject', 'must be a string'],
    ]);

    const registry = {
      async resolve() {
        return { name: 'usaf_memo' };
      },
      engine: {
        dryRun() {
          throw errorMap;
        },
      },
    };

    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(registry, strategy, VALID_CONTENT);

    assert.equal(result.status, 'error');
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /recipient: is required/);
    assert.match(result.errors[0].message, /subject: must be a string/);
  });
});

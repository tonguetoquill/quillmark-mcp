/**
 * @module test/primitives/createDocument
 *
 * Tests for the {@link createDocument} primitive.
 *
 * Covers:
 * - YAML quoting handled natively by Document.fromMarkdown (single + double quotes on QUILL)
 * - Happy path: parse -> resolve -> strategy.handle delegation
 * - Structured error when QUILL field is missing from frontmatter
 * - Structured error for unresolvable quill refs
 * - Strategy delegation receives (quill handle, parsed Document)
 * - Strategy throws bubble out as structured errors
 * - Empty / non-string content is rejected up-front
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDocument } from '../../src/primitives/createDocument.js';

const FIXTURE_QUIVER_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

/** @constant {string} VALID_CONTENT - Minimal valid Quillmark document with frontmatter. */
const VALID_CONTENT = `---
QUILL: usaf_memo
---
# Memo`;

async function loadCatalog() {
  init();
  const engine = new Quillmark();
  const quiver = await Quiver.fromDir(FIXTURE_QUIVER_DIR);
  return { quiver, engine };
}

describe('createDocument', () => {
  it('accepts double-quoted QUILL scalars', async () => {
    const { quiver, engine } = await loadCatalog();
    const quotedContent = `---\nQUILL: "usaf_memo@1.0.0"\n---\n# Memo`;
    let receivedRef;
    const strategy = {
      async handle(quill, doc) {
        receivedRef = doc.quillRef;
        return { status: 'success', url: 'x' };
      },
    };
    const result = await createDocument(quiver, engine, strategy, quotedContent);
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.equal(receivedRef, 'usaf_memo@1.0.0');
  });

  it('accepts single-quoted QUILL scalars', async () => {
    const { quiver, engine } = await loadCatalog();
    const quotedContent = `---\nQUILL: 'usaf_memo'\n---\n# Memo`;
    let receivedRef;
    const strategy = {
      async handle(quill, doc) {
        receivedRef = doc.quillRef;
        return { status: 'success', url: 'x' };
      },
    };
    await createDocument(quiver, engine, strategy, quotedContent);
    assert.equal(receivedRef, 'usaf_memo');
  });

  it('returns strategy result for valid content and passes (quill, doc) tuple', async () => {
    const { quiver, engine } = await loadCatalog();

    const strategyResult = { status: 'success', url: 'https://example.com/doc.pdf' };
    let captured;
    const strategy = {
      async handle(quill, doc) {
        captured = { quill, doc };
        return strategyResult;
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, strategyResult);
    assert.equal(captured.quill.metadata.schema.name, 'usaf_memo');
    assert.equal(captured.doc.quillRef, 'usaf_memo');
  });

  it('returns structured error when QUILL field is missing', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '---\ntitle: memo\n---\n# Memo',
    );

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'QUILL: is required in frontmatter to select the Quill format.' }],
    });
  });

  it('returns structured error for invalid quill ref', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw new Error('should not be called');
      },
    };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '---\nQUILL: not_a_real_quill\n---\n# Body',
    );

    assert.equal(result.status, 'error');
    assert.match(
      result.errors[0].message,
      /Unable to resolve Quill format reference "not_a_real_quill"/,
    );
  });

  it('returns structured error when strategy.handle() throws an Error', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw new Error('disk full');
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'Strategy failed: disk full' }],
    });
  });

  it('returns structured error when strategy.handle() throws a non-Error value', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw 'unexpected failure';
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'Strategy failed: unexpected failure' }],
    });
  });

  it('rejects empty content up-front without touching quiver or strategy', async () => {
    const quiver = { getQuill: async () => { throw new Error('should not call'); } };
    const strategy = { async handle() { throw new Error('should not call'); } };

    const result = await createDocument(quiver, {}, strategy, '   ');

    assert.deepStrictEqual(result, {
      status: 'error',
      errors: [{ message: 'Content must be a non-empty string.' }],
    });
  });
});

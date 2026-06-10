import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Engine, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';
import { fileURLToPath } from 'node:url';

import { createDocument } from '../../src/primitives/createDocument.js';

const FIXTURE_QUIVER_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

const VALID_CONTENT = `~~~card-yaml
$quill: usaf_memo
$kind: main
~~~
# Memo`;

async function loadCatalog() {
  init();
  const engine = new Engine();
  const quiver = await Quiver.fromDir(FIXTURE_QUIVER_DIR);
  return { quiver, engine };
}

describe('createDocument', () => {
  it('accepts double-quoted QUILL scalars', async () => {
    const { quiver, engine } = await loadCatalog();
    const quotedContent = `~~~card-yaml\n$quill: "usaf_memo@1.0.0"\n$kind: main\n~~~\n# Memo`;
    let receivedRef;
    const strategy = {
      async handle(quill, doc) {
        receivedRef = doc.quillRef;
        return { url: 'x', mimeType: 'application/pdf' };
      },
    };
    const result = await createDocument(quiver, engine, strategy, quotedContent);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(receivedRef, 'usaf_memo@1.0.0');
  });

  it('accepts single-quoted QUILL scalars', async () => {
    const { quiver, engine } = await loadCatalog();
    const quotedContent = `~~~card-yaml\n$quill: 'usaf_memo'\n$kind: main\n~~~\n# Memo`;
    let receivedRef;
    const strategy = {
      async handle(quill, doc) {
        receivedRef = doc.quillRef;
        return { url: 'x', mimeType: 'application/pdf' };
      },
    };
    await createDocument(quiver, engine, strategy, quotedContent);
    assert.equal(receivedRef, 'usaf_memo');
  });

  it('returns ok with url+mimeType for valid content and passes (quill, doc) tuple', async () => {
    const { quiver, engine } = await loadCatalog();

    let captured;
    const strategy = {
      async handle(quill, doc) {
        captured = { quill, doc };
        return { url: 'https://example.com/doc.pdf', mimeType: 'application/pdf' };
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.deepStrictEqual(result, { ok: true, url: 'https://example.com/doc.pdf', mimeType: 'application/pdf' });
    assert.equal(captured.quill.metadata.name, 'usaf_memo');
    assert.equal(captured.doc.quillRef, 'usaf_memo');
  });

  it('returns ok:false when QUILL field is missing', async () => {
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
      '~~~card-yaml\n$kind: main\ntitle: memo\n~~~\n# Memo',
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /\$quill: <name> is required/);
  });

  it('returns ok:false for invalid quill ref', async () => {
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
      '~~~card-yaml\n$quill: not_a_real_quill\n$kind: main\n~~~\n# Body',
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /Unable to resolve Quill format reference "not_a_real_quill"/);
  });

  it('returns ok:false when strategy.handle() throws an Error', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw new Error('disk full');
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.equal(result.ok, false);
    assert.match(result.message, /Document rendering failed: disk full/);
  });

  it('returns ok:false when strategy.handle() throws a non-Error value', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw 'unexpected failure';
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.equal(result.ok, false);
    assert.match(result.message, /Document rendering failed: unexpected failure/);
  });

  it('wraps Rust panic strings as internal renderer errors', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = {
      async handle() {
        throw new Error('byte index 2 is not a character boundary; it is inside \'—\' (bytes 1..4)');
      },
    };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.equal(result.ok, false);
    assert.match(result.message, /Internal renderer error/);
    assert.doesNotMatch(result.message, /Document rendering failed/);
  });

  it('annotates "$quill missing" with a hint about `---` frontmatter', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = { async handle() { throw new Error('unreachable'); } };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$kind: main\ntitle: memo\n~~~\n# Memo',
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /\$quill: <name> is required/);
    assert.match(result.message, /`---` YAML frontmatter/);
  });

  it('returns missing-quill hint when root card-yaml block is unclosed', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = { async handle() { throw new Error('unreachable'); } };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$quill: usaf_memo\n$kind: main\ntitle: memo\n\nbody without closer',
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /\$quill: <name> is required/);
  });

  it('includes available quill names when ref cannot be resolved', async () => {
    const { quiver, engine } = await loadCatalog();
    const strategy = { async handle() { throw new Error('unreachable'); } };

    const result = await createDocument(
      quiver,
      engine,
      strategy,
      '~~~card-yaml\n$quill: not_a_real_quill\n$kind: main\n~~~\n# Body',
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /Unable to resolve Quill format reference "not_a_real_quill"/);
    assert.match(result.message, /Available quills:/);
  });

  it('surfaces wasm diagnostics on render failure', async () => {
    const { quiver, engine } = await loadCatalog();
    const diagnosticsErr = Object.assign(new Error('render exploded'), {
      diagnostics: [{ severity: 'error', message: 'unknown field', hint: 'try x' }],
    });
    const strategy = { async handle() { throw diagnosticsErr; } };

    const result = await createDocument(quiver, engine, strategy, VALID_CONTENT);

    assert.equal(result.ok, false);
    assert.deepStrictEqual(result.diagnostics, [{ severity: 'error', message: 'unknown field', hint: 'try x' }]);
  });

  it('rejects empty content up-front without touching quiver or strategy', async () => {
    const quiver = { getQuill: async () => { throw new Error('should not call'); } };
    const strategy = { async handle() { throw new Error('should not call'); } };

    const result = await createDocument(quiver, {}, strategy, '   ');

    assert.deepStrictEqual(result, { ok: false, message: 'Content must be a non-empty string.' });
  });
});

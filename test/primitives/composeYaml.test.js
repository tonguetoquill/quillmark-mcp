/**
 * @module test/primitives/composeYaml
 *
 * Tests for {@link toYamlBlock} and {@link composeContent} from the composeYaml primitive.
 *
 * toYamlBlock coverage:
 * - String scalars JSON-double-quoted, numbers/booleans unquoted
 * - String arrays emitted block-style; empty arrays as inline []
 * - Nested objects serialized as flow-style JSON (valid YAML superset)
 * - Special chars escaped via JSON encoding, null -> "null", undefined skipped
 * - Non-object input rejected with TypeError
 *
 * composeContent coverage:
 * - Full Quillmark document assembly (--- delimiters, QUILL line, fields, body)
 * - QUILL param takes precedence over any QUILL key in fields
 * - Missing fields treated as empty object
 * - Empty body still produces valid structure
 * - Field ordering: QUILL first, then user-supplied fields in insertion order
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toYamlBlock, composeContent } from '../../src/primitives/composeYaml.js';

describe('composeYaml', () => {
  describe('toYamlBlock', () => {
    it('quotes every scalar string with JSON double-quotes (always valid YAML)', () => {
      const out = toYamlBlock({ subject: 'Hello, World' });
      assert.equal(out, 'subject: "Hello, World"');
    });

    it('handles numbers and booleans without quoting', () => {
      const out = toYamlBlock({ font_size: 11, enabled: true, disabled: false });
      assert.match(out, /^font_size: 11$/m);
      assert.match(out, /^enabled: true$/m);
      assert.match(out, /^disabled: false$/m);
    });

    it('emits string arrays in block style', () => {
      const out = toYamlBlock({
        memo_from: ['673 ABW/CC', 'JBER', '9480 Pease Ave, Anchorage AK 99506'],
      });
      assert.equal(
        out,
        'memo_from:\n  - "673 ABW/CC"\n  - "JBER"\n  - "9480 Pease Ave, Anchorage AK 99506"',
      );
    });

    it('empty array emits inline []', () => {
      assert.equal(toYamlBlock({ cc: [] }), 'cc: []');
    });

    it('nested object emits as flow-style JSON (valid YAML)', () => {
      const out = toYamlBlock({
        metadata: { author: 'Jane', tags: ['a', 'b'] },
      });
      assert.match(out, /^metadata: \{"author":"Jane","tags":\["a","b"\]\}$/m);
    });

    it('strings with special chars are still valid (quoted)', () => {
      const out = toYamlBlock({ subject: 'He said: "hi" & ran' });
      // JSON escapes the inner quotes; YAML accepts JSON-encoded strings.
      assert.match(out, /subject: "He said: \\"hi\\" & ran"/);
    });

    it('null value becomes YAML null', () => {
      assert.equal(toYamlBlock({ date: null }), 'date: null');
    });

    it('skips undefined values', () => {
      const out = toYamlBlock({ kept: 'yes', dropped: undefined, also_kept: 42 });
      assert.match(out, /^kept: "yes"$/m);
      assert.match(out, /^also_kept: 42$/m);
      assert.doesNotMatch(out, /dropped/);
    });

    it('rejects non-object input with TypeError', () => {
      assert.throws(() => toYamlBlock(null), TypeError);
      assert.throws(() => toYamlBlock([1, 2, 3]), TypeError);
      assert.throws(() => toYamlBlock('string'), TypeError);
    });
  });

  describe('composeContent', () => {
    it('assembles a full Quillmark document with --- delimiters', () => {
      const out = composeContent({
        quill: 'usaf_memo',
        fields: { subject: 'Test' },
        body: 'Para 1.',
      });
      assert.equal(
        out,
        '---\nQUILL: "usaf_memo"\nsubject: "Test"\n---\n\nPara 1.',
      );
    });

    it('QUILL from the quill param wins over any QUILL key in fields', () => {
      const out = composeContent({
        quill: 'usaf_memo',
        fields: { QUILL: 'resume', subject: 'x' },
        body: 'b',
      });
      const lines = out.split('\n');
      const quillLines = lines.filter((l) => /^QUILL:/.test(l));
      assert.equal(quillLines.length, 1);
      assert.equal(quillLines[0], 'QUILL: "usaf_memo"');
    });

    it('missing fields is treated as empty object', () => {
      const out = composeContent({ quill: 'q', body: 'b' });
      assert.match(out, /^---\nQUILL: "q"\n---\n\nb$/);
    });

    it('empty body still produces valid structure', () => {
      const out = composeContent({ quill: 'q', fields: { a: 1 }, body: '' });
      assert.match(out, /^---\nQUILL: "q"\na: 1\n---\n\n$/);
    });

    it('field order is preserved (Quill first, then user fields)', () => {
      const out = composeContent({
        quill: 'usaf_memo',
        fields: { subject: 'A', memo_from: ['X'], date: '2026-04-11' },
        body: 'b',
      });
      const headerLines = out.split('\n').slice(1, -3); // between --- markers
      assert.equal(headerLines[0], 'QUILL: "usaf_memo"');
      assert.equal(headerLines[1], 'subject: "A"');
    });
  });
});

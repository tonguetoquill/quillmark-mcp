import { Document } from '@quillmark/wasm';

import { availableQuillsHint } from './availableQuillsHint.js';

// MCP-specific notes layered on top of core's canonical guidance. Core owns the
// authoring header (`Document.blueprintInstruction`) and the format invariants
// (`Document.formatRules()` ← `quillmark_core::document::FORMAT_RULES`); we add
// only what core's invariant set intentionally leaves out: an explicit
// anti-pattern, a model-behavior nudge, and how to read the blueprint's inline
// comments. Keeping the rules in core is the single source of truth — they
// can't drift here the way a hand-copied block did.
const MCP_NOTES = [
  'A few more pointers for this interface:',
  '• Do NOT use `---` YAML frontmatter — the only metadata syntax is the `~~~` card-yaml block.',
  '• Copy the `$quill` and `$kind` lines verbatim from the blueprint; never omit, rename, or reword them, or the document cannot be matched to a quill.',
  '• In the blueprint, a trailing `# ...` on a value line is a hint (`# string`, `# e.g. ...`), not data — do not turn it into a value.',
].join('\n');

export async function getSpec(quiver, engine, quill) {
  if (typeof quill !== 'string' || quill.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  let resolved;
  try {
    resolved = await quiver.getQuill(quill);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${quill}": ${message}.${availableQuillsHint(quiver)}`, { cause: error });
  }

  const blueprint = typeof resolved?.blueprint === 'string' ? resolved.blueprint : '';
  const instruction = [
    Document.blueprintInstruction(quill),
    '',
    Document.formatRules(),
    '',
    MCP_NOTES,
  ].join('\n');

  return { instruction, blueprint };
}

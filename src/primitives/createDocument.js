import { Document } from '@quillmark/wasm';

import { getErrorMessage } from '../errors.js';
import { availableQuillsHint } from './availableQuillsHint.js';

const MISSING_QUILL_MESSAGE = [
  '$quill: <name> is required in the root card-yaml block to select the Quill format.',
  '',
  'If you used `---` YAML frontmatter, that syntax is NOT supported. Replace the `---` fences with',
  '`~~~card-yaml` (opener) and `~~~` (closer), and put `$quill: <name>@<version>` and `$kind: main`',
  'as the first two lines inside the block. Call `get_spec` for a ready-to-edit blueprint.',
].join('\n');

// Patterns that indicate an internal renderer panic leaking through the WASM
// boundary rather than a user-content problem. LLMs in a tool-use loop cannot
// "fix" content based on Rust panic strings — wrap them so the caller knows
// this is a Quillmark bug, not their input.
const PANIC_PATTERNS = [
  /is not a character boundary/i,
  /^panicked at /i,
  /assertion failed/i,
  /index out of bounds/i,
  /unreachable executed/i,
];

function looksLikePanic(message) {
  return PANIC_PATTERNS.some((re) => re.test(message));
}

function isMissingQuillError(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) && diagnostics.some((d) => d?.code === 'parse::missing_quill');
}

function extractDiagnostics(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function annotateParseError(message) {
  if (/never closed with `~~~`/.test(message)) {
    return [
      message,
      '',
      'Close the block with a line containing exactly `~~~` (three tildes, no info string)',
      'before any prose body. The closer is unadorned — do NOT use `~~~card-yaml` as the closer.',
    ].join('\n');
  }
  return message;
}

export async function createDocument(quiver, engine, strategy, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, message: 'Content must be a non-empty string.' };
  }

  let doc;
  try {
    doc = Document.fromMarkdown(content);
  } catch (error) {
    if (isMissingQuillError(error)) {
      return { ok: false, message: MISSING_QUILL_MESSAGE };
    }
    return {
      ok: false,
      message: `Document parse failed: ${annotateParseError(getErrorMessage(error))}`,
      diagnostics: extractDiagnostics(error),
    };
  }

  // The parse::missing_quill diagnostic check above doesn't catch everything:
  // the parser can succeed yet still yield an empty quillRef, so re-check here.
  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return { ok: false, message: MISSING_QUILL_MESSAGE };
  }

  let quill;
  try {
    quill = await quiver.getQuill(quillRef);
  } catch (error) {
    return {
      ok: false,
      message: `Unable to resolve Quill format reference "${quillRef}": ${getErrorMessage(error)}.${availableQuillsHint(quiver)}`,
    };
  }

  try {
    const { url, mimeType } = await strategy.handle(quill, doc, engine);
    return { ok: true, url, mimeType };
  } catch (error) {
    const raw = getErrorMessage(error);
    if (looksLikePanic(raw)) {
      return {
        ok: false,
        message: `Internal renderer error (please report to Quillmark maintainers): ${raw}`,
      };
    }
    return {
      ok: false,
      message: `Document rendering failed: ${raw}`,
      diagnostics: extractDiagnostics(error),
    };
  }
}

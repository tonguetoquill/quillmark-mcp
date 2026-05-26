import { Document } from '@quillmark/wasm';

import { getErrorMessage } from '../errors.js';

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

function extractDiagnostics(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function availableQuillsHint(quiver) {
  try {
    const names = typeof quiver?.quillNames === 'function' ? quiver.quillNames() : [];
    if (!Array.isArray(names) || names.length === 0) return '';
    return ` Available quills: ${names.join(', ')}. Drop the @version suffix to bind to the latest available version.`;
  } catch {
    return '';
  }
}

export async function createDocument(quiver, engine, strategy, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, message: 'Content must be a non-empty string.' };
  }

  let doc;
  try {
    doc = Document.fromMarkdown(content);
  } catch (error) {
    return {
      ok: false,
      message: `Document parse failed: ${getErrorMessage(error)}`,
      diagnostics: extractDiagnostics(error),
    };
  }

  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return {
      ok: false,
      message: "The document's root card-yaml block must declare `$quill: <name>`.",
    };
  }

  let quill;
  try {
    quill = await quiver.getQuill(quillRef, { engine });
  } catch (error) {
    return {
      ok: false,
      message: `Unable to resolve Quill format reference "${quillRef}": ${getErrorMessage(error)}.${availableQuillsHint(quiver)}`,
    };
  }

  try {
    const { url, mimeType } = await strategy.handle(quill, doc);
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

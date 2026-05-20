import { Document } from '@quillmark/wasm';

import { getErrorMessage } from '../errors.js';

const MISSING_QUILL_MESSAGE = '`#@quill` is required in the root `~~~card-yaml` block to select the Quill format.';

function isMissingQuillError(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) && diagnostics.some((d) => d?.code === 'parse::missing_quill');
}

function extractDiagnostics(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) ? diagnostics : [];
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
      message: `Document parse failed: ${getErrorMessage(error)}`,
      diagnostics: extractDiagnostics(error),
    };
  }

  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return { ok: false, message: MISSING_QUILL_MESSAGE };
  }

  let quill;
  try {
    quill = await quiver.getQuill(quillRef, { engine });
  } catch (error) {
    return {
      ok: false,
      message: `Unable to resolve Quill format reference "${quillRef}": ${getErrorMessage(error)}`,
    };
  }

  try {
    const { url, mimeType } = await strategy.handle(quill, doc);
    return { ok: true, url, mimeType };
  } catch (error) {
    return {
      ok: false,
      message: `Document rendering failed: ${getErrorMessage(error)}`,
      diagnostics: extractDiagnostics(error),
    };
  }
}

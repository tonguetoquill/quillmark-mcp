/**
 * @module createDocument
 */

import { Document } from '@quillmark/wasm';

import { getErrorMessage } from '../errors.js';

const MISSING_QUILL_MESSAGE = 'QUILL: is required in frontmatter to select the Quill format.';

/** Wraps a message in the `{ status: 'error', errors: [...] }` shape. */
function formatError(message) {
  return { status: 'error', errors: [{ message }] };
}

/**
 * Identifies a missing-QUILL parse failure on a thrown Document error.
 * The wasm engine (>=0.77.0) emits a dedicated `parse::missing_quill_field`
 * diagnostic; we surface our own friendly wording so MCP clients see a
 * consistent prompt.
 */
function isMissingQuillError(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  if (!Array.isArray(diagnostics)) return false;
  return diagnostics.some((d) => d?.code === 'parse::missing_quill_field');
}

/**
 * Validates and persists a Quillmark document through the full pipeline:
 *
 * 1. Validate `content` is a non-empty string.
 * 2. Parse into a `Document` via the wasm engine (extracts `quillRef`).
 * 3. Resolve the quill via Quiver (materializes a render-ready `Quill`).
 * 4. Delegate to the injected strategy for persistence (e.g. render to disk).
 *
 * Non-throwing by design: every failure becomes a structured
 * `{ status: 'error', errors: [...] }` response. MCP tool handlers cannot
 * throw — errors must be expressed as tool results.
 *
 * @param {object} quiver - `Quiver` instance from `@quillmark/quiver`.
 * @param {object} engine - `Quillmark` engine from `@quillmark/wasm`.
 * @param {object} strategy - Persistence strategy. Must expose
 *   `handle(quill, doc)` returning a Promise of `{ status, url?, errors? }`.
 * @param {string} content - Quillmark document: YAML frontmatter (with `QUILL:`) + markdown body.
 * @returns {Promise<object>} Success or structured error result.
 */
export async function createDocument(quiver, engine, strategy, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return formatError('Content must be a non-empty string.');
  }

  let doc;
  try {
    doc = Document.fromMarkdown(content);
  } catch (error) {
    return formatError(isMissingQuillError(error) ? MISSING_QUILL_MESSAGE : getErrorMessage(error));
  }

  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return formatError(MISSING_QUILL_MESSAGE);
  }

  let quill;
  try {
    quill = await quiver.getQuill(quillRef, { engine });
  } catch (error) {
    return formatError(`Unable to resolve Quill format reference "${quillRef}": ${getErrorMessage(error)}`);
  }

  let result;
  try {
    result = await strategy.handle(quill, doc);
  } catch (error) {
    return formatError(`Strategy failed: ${getErrorMessage(error)}`);
  }

  if (result.status === 'error' && Array.isArray(result.errors)) {
    result.errors = result.errors.map((error) => ({
      message: getErrorMessage(error.message ?? error),
    }));
  }

  return result;
}

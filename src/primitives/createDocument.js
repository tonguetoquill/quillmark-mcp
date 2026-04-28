/**
 * @module createDocument
 */

import { Document } from '@quillmark/wasm';

/**
 * Builds a structured error result matching the createDocument return shape.
 *
 * @param {string} message - Human-readable error description.
 * @returns {object} `{ status: 'error', errors: [{ message }] }`
 */
function formatError(message) {
  return { status: 'error', errors: [{ message }] };
}

/**
 * Coerces an arbitrary error value into a human-readable string.
 *
 * Handles the full zoo of things the WASM engine and strategy layer can
 * surface: standard Error instances (with optional `.diagnostics`), Map objects,
 * plain objects, and primitives.
 *
 * @param {unknown} error - The thrown/returned error value.
 * @returns {string} A best-effort human-readable error message.
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error instanceof Map) {
    if (error.has('message')) return String(error.get('message'));
    const entries = Array.from(error.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    return entries || 'Unknown validation error';
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Identifies a missing-QUILL parse failure on a thrown Document error.
 * The wasm engine emits a `parse::invalid_structure` diagnostic with a
 * message that mentions "QUILL". We surface our own friendly wording
 * for that specific failure so MCP clients see a consistent prompt.
 */
function isMissingQuillError(error) {
  if (!error || typeof error !== 'object') return false;
  const diagnostics = /** @type {any} */ (error).diagnostics;
  if (!Array.isArray(diagnostics)) return false;
  return diagnostics.some((d) =>
    d?.code === 'parse::invalid_structure' && /QUILL/i.test(String(d?.message ?? '')),
  );
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
    if (isMissingQuillError(error)) {
      return formatError('QUILL: is required in frontmatter to select the Quill format.');
    }
    return formatError(getErrorMessage(error));
  }

  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return formatError('QUILL: is required in frontmatter to select the Quill format.');
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
      message: getErrorMessage(error.message || error),
    }));
  }

  return result;
}

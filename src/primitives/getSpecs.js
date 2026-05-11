/**
 * @module getSpecs
 */

import { encode } from '@toon-format/toon';

/**
 * Returns the quill's LLM authoring guidance.
 *
 * Uses `quill.blueprint` — the auto-generated annotated Markdown blueprint
 * produced by the engine from the quill's schema, designed for LLM consumers.
 */
function extractInstructions(quill) {
  if (typeof quill?.blueprint === 'string') return quill.blueprint;
  return '';
}

/**
 * Resolves a Quill format reference and returns its schema (TOON-encoded)
 * plus authoring instructions for LLM consumption.
 *
 * The schema is encoded via TOON (a compact, token-efficient serialisation)
 * so it fits within LLM context windows without wasting tokens on JSON
 * verbosity. The encoder can be overridden via `deps.encodeSchema` for
 * testing or alternative serialisation formats.
 *
 * Throws on every failure path (invalid ref, resolution failure, missing
 * schema) — callers are expected to catch and surface errors to the user.
 *
 * @param {object} quiver - `Quiver` instance from `@quillmark/quiver`.
 * @param {object} engine - `Quillmark` engine from `@quillmark/wasm`.
 * @param {string} ref - Identifier for the Quill format (e.g. `name` or `name@version`).
 * @param {object} [deps] - Injectable dependencies. May include `encodeSchema(schema)`.
 * @returns {Promise<object>} TOON-encoded schema + authoring instructions (`{ schema, instructions }`).
 * @throws {Error} If `ref` is empty, resolution fails, or no schema is available.
 */
export async function getSpecs(quiver, engine, ref, deps = {}) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  const encodeSchema = deps.encodeSchema ?? encode;

  let quill;
  try {
    quill = await quiver.getQuill(ref, { engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${ref}": ${message}`, { cause: error });
  }

  const schema = quill?.schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`Quill "${ref}" did not expose a schema.`);
  }

  return {
    schema: encodeSchema(schema),
    instructions: extractInstructions(quill),
  };
}

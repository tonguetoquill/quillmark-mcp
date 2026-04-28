/**
 * @module getSpecs
 */

import { encode } from '@toon-format/toon';

/**
 * Picks authoring instructions out of a quill's metadata.
 *
 * Fallback chain: `metadata.schema.example` (the rendered contents of
 * `example_file`, when set) → `metadata.instructions` (free-form prose under
 * the `quill:` section) → empty string.
 *
 * @param {object | undefined} metadata - The `quill.metadata` object from `@quillmark/wasm`.
 * @returns {string} Authoring instructions, or `''` if none are available.
 */
function extractInstructions(metadata) {
  if (typeof metadata?.schema?.example === 'string') {
    return metadata.schema.example;
  }
  if (typeof metadata?.instructions === 'string') {
    return metadata.instructions;
  }
  return '';
}

/**
 * Coerces an arbitrary schema value into a JSON-compatible plain object.
 *
 * The wasm engine returns `metadata.schema` as a structured JS object, but
 * we round-trip through JSON to defensively strip prototype chains, drop
 * `undefined`/function values, and reject non-object roots (arrays/scalars).
 *
 * @param {unknown} value - The raw schema from `quill.metadata.schema`.
 * @param {string} ref - The quill ref for error messages.
 * @returns {object} Plain JSON-safe schema object.
 */
function normalizeSchemaObject(value, ref) {
  let normalized;
  try {
    normalized = JSON.parse(JSON.stringify(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to normalize schema for "${ref}": ${message}`, { cause: error });
  }

  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new TypeError(`Schema for "${ref}" must be a JSON object.`);
  }
  return normalized;
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

  const rawSchema = quill?.metadata?.schema;
  if (!rawSchema || typeof rawSchema !== 'object') {
    throw new Error(`Quill "${ref}" did not expose a schema via metadata.`);
  }

  return {
    schema: encodeSchema(normalizeSchemaObject(rawSchema, ref)),
    instructions: extractInstructions(quill.metadata),
  };
}

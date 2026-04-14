/**
 * @module getSpecs
 */

import { encode } from '@toon-format/toon';
import yaml from 'js-yaml';

/**
 * Extracts authoring instructions from a resolved Quill's metadata.
 *
 * Fallback chain: `quillInfo.example` (preferred, typically a full sample
 * document) → `quillInfo.metadata.instructions` (prose guidance) → empty
 * string. This lets Quill authors ship either a concrete example or free-form
 * instructions, with the example taking priority when both exist.
 *
 * @param {object} quillInfo - Object with optional `example` (string) and optional `metadata.instructions` (string).
 * @returns {string} Authoring instructions, or `''` if none are available.
 */
function extractInstructions(quillInfo) {
  if (typeof quillInfo?.example === 'string') {
    return quillInfo.example;
  }

  if (typeof quillInfo?.metadata?.instructions === 'string') {
    return quillInfo.metadata.instructions;
  }

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
 * engine) — callers are expected to catch and surface errors to the user.
 *
 * @param {object} registry
 *   The package registry with an attached WASM engine. Must expose `resolve(ref)` returning
 *   `Promise<{ name }>` and optionally `engine` with `getQuillInfo(name)` and `getQuillSchema(name)`.
 * @param {string} ref - Identifier for the Quill format (e.g. package name or name@version).
 * @param {object} [deps] - Injectable dependencies; defaults to TOON encoder. May include `encodeSchema(schema)`.
 * @returns {Promise<object>} TOON-encoded schema + authoring instructions (`{ schema, instructions }`).
 * @throws {Error} If `ref` is empty, resolution fails, or the registry lacks a WASM engine.
 */
export async function getSpecs(registry, ref, deps = {}) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  const encodeSchema = deps.encodeSchema ?? encode;

  let bundle;
  try {
    bundle = await registry.resolve(ref);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${ref}": ${message}`, { cause: error });
  }

  const engine = registry.engine;
  if (!engine || typeof engine.getQuillInfo !== 'function') {
    throw new Error('Registry does not have an attached wasm engine with getQuillInfo/getQuillSchema methods.');
  }

  const quillInfo = engine.getQuillInfo(bundle.name);
  const schemaSource = typeof engine.getQuillSchema === 'function'
    ? engine.getQuillSchema(bundle.name)
    : quillInfo?.schema;

  let schemaObject;
  // Backward-compatibility: older engines exposed already-materialized schema
  // objects (pre-YAML transition). Keep accepting that shape so callers do not
  // break if registry/engine versions are temporarily mixed.
  if (schemaSource && typeof schemaSource === 'object' && !Array.isArray(schemaSource)) {
    schemaObject = schemaSource;
  } else if (typeof schemaSource === 'string') {
    try {
      const parsed = yaml.load(schemaSource, { schema: yaml.JSON_SCHEMA });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError('Schema YAML must deserialize to an object.');
      }
      schemaObject = parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse schema for "${bundle.name}": ${message}`, { cause: error });
    }
  } else {
    throw new Error(`WASM engine did not provide schema for "${bundle.name}" via getQuillSchema() or getQuillInfo().schema.`);
  }

  return {
    schema: encodeSchema(schemaObject),
    instructions: extractInstructions(quillInfo),
  };
}

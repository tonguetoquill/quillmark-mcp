/**
 * @module primitives
 *
 * Public API surface for Quillmark MCP primitives.
 *
 * Re-exports the three core operations that MCP tool handlers delegate to:
 * - {@link listQuills} — enumerate available Quill document formats
 * - {@link getSpecs} — retrieve schema + authoring instructions for a Quill
 * - {@link createDocument} — validate and persist a Quillmark document
 *
 * All primitives accept a registry as their first argument and are designed
 * to be strategy-agnostic (the persistence mechanism is injected, not owned).
 */
export { listQuills } from './listQuills.js';
export { getSpecs } from './getSpecs.js';
export { createDocument } from './createDocument.js';

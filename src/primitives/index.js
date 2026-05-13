/**
 * @module primitives
 *
 * Public API surface for Quillmark MCP primitives.
 *
 * Re-exports the three core operations that MCP tool handlers delegate to:
 * - {@link listQuills} — enumerate available Quill document formats
 * - {@link getSpecs} — retrieve composing instruction + blueprint for a Quill
 * - {@link createDocument} — parse and persist a Quillmark document
 *
 * All primitives take a `(quiver, engine, ...)` prefix from
 * `@quillmark/quiver` + `@quillmark/wasm` and are strategy-agnostic — the
 * persistence mechanism is injected via `DeliveryStrategy`, not owned by
 * the primitive.
 */
export { listQuills } from './listQuills.js';
export { getSpecs } from './getSpecs.js';
export { createDocument } from './createDocument.js';

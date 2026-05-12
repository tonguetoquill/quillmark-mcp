/**
 * @module getSpecs
 */

/**
 * Resolves a Quill format reference and returns a concise composing instruction
 * plus the quill's blueprint for LLM consumption.
 *
 * Throws on every failure path (invalid ref, resolution failure) — callers are
 * expected to catch and surface errors to the user.
 *
 * @param {object} quiver - `Quiver` instance from `@quillmark/quiver`.
 * @param {object} engine - `Quillmark` engine from `@quillmark/wasm`.
 * @param {string} ref - Identifier for the Quill format (e.g. `name` or `name@version`).
 * @returns {Promise<object>} `{ instruction, blueprint }`
 * @throws {Error} If `ref` is empty or resolution fails.
 */
export async function getSpecs(quiver, engine, ref) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  let quill;
  try {
    quill = await quiver.getQuill(ref, { engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${ref}": ${message}`, { cause: error });
  }

  const blueprint = typeof quill?.blueprint === 'string' ? quill.blueprint : '';
  const instruction = `The blueprint below specifies the YAML block and markdown body standards for the \`${ref}\` quill. To compose a document, write a single markdown string that begins with a \`---\` YAML block containing \`QUILL: ${ref}\` plus every field the blueprint marks required, followed by \`---\` and the markdown body. Pass that string as \`content\` to \`create_document\`.`;

  return { instruction, blueprint };
}

/**
 * @module listQuills
 */

/**
 * Lists installed Quill formats (document templates) from a Quiver.
 *
 * For each quill name, this materialises the latest version via the engine
 * to read its `description` (declared under `quill:` in `Quill.yaml`).
 * Materialisation is cached per `(engine, canonical-ref)` by Quiver, so
 * repeated calls are cheap. Per-quill failures are isolated — a single
 * broken quill yields an empty description rather than collapsing the
 * whole listing.
 *
 * Non-throwing by design: any error at the Quiver layer (e.g. missing
 * manifest) returns an empty array so the MCP tool layer always responds
 * with a valid shape.
 *
 * @param {object} quiver - `Quiver` instance from `@quillmark/quiver`.
 * @param {object} engine - `Quillmark` engine from `@quillmark/wasm`.
 * @returns {Promise<Array<{ name: string, description: string }>>}
 *   Listed quills with normalised descriptions, or `[]` on any catalog-level error.
 */
export async function listQuills(quiver, engine) {
  let names;
  try {
    names = quiver.quillNames();
  } catch {
    return [];
  }

  return Promise.all(
    names.map(async (name) => {
      try {
        const quill = await quiver.getQuill(name, { engine });
        const main = quill?.metadata?.schema?.main;
        const description = typeof main?.description === 'string' ? main.description : '';
        return { name, description };
      } catch {
        return { name, description: '' };
      }
    }),
  );
}

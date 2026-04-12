/**
 * @module listQuills
 */

/**
 * Lists installed Quill formats (document templates) from the registry.
 *
 * Non-throwing by design: registry failures (network, WASM init, corrupt
 * packages) are swallowed and produce an empty array so the MCP tool layer
 * always returns a valid response. Descriptions are normalised to strings —
 * missing or non-string descriptions become `''` to guarantee a uniform
 * shape for downstream consumers.
 *
 * @param {object} registry
 *   The package registry that can enumerate installed Quill formats.
 *   Must expose `getAvailableQuills()` returning `Promise<Array<{ name, description }>>`.
 * @returns {Promise<Array<object>>}
 *   Resolved list of quills (`{ name: string, description: string }`) with normalised descriptions, or `[]` on any error.
 */
export async function listQuills(registry) {
  try {
    const quills = await registry.getAvailableQuills();

    return quills.map((quill) => ({
      name: quill.name,
      description: typeof quill.description === 'string' ? quill.description : '',
    }));
  } catch {
    // Intentionally return a safe empty result to keep the primitive non-throwing.
    return [];
  }
}

/**
 * @param {{ getAvailableQuills: () => Promise<Array<{ name: string, description?: string }>> }} registry
 * @returns {Promise<Array<{ name: string, description: string }>>}
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

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
        const version = typeof quill?.metadata?.version === 'string'
          ? quill.metadata.version
          : '';
        const description = typeof quill?.metadata?.description === 'string'
          ? quill.metadata.description
          : '';
        return { name, version, description };
      } catch {
        return { name, version: '', description: '' };
      }
    }),
  );
}

export async function getSpecs(quiver, engine, quill) {
  if (typeof quill !== 'string' || quill.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  let resolved;
  try {
    resolved = await quiver.getQuill(quill, { engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${quill}": ${message}`, { cause: error });
  }

  const blueprint = typeof resolved?.blueprint === 'string' ? resolved.blueprint : '';
  const instruction = `The blueprint below specifies the YAML block and markdown body standards for the \`${quill}\` quill. To compose a document, write a single markdown string that begins with a \`---\` YAML block containing \`QUILL: ${quill}\` plus every field the blueprint marks required, followed by \`---\` and the markdown body. Pass that string as \`content\` to \`create_document\`.`;

  return { instruction, blueprint };
}

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
  const instruction = `The blueprint below specifies the card-yaml block and markdown body standards for the \`${quill}\` quill. To compose a document, write a single markdown string that begins with a \`~~~card-yaml\` block whose header is \`#@quill: ${quill}\` followed by every field the blueprint marks required, then \`~~~\` and the markdown body. Composable blocks (cards) use additional \`~~~card-yaml\` blocks with a \`#@kind: <kind>\` header. A blank line is required above every \`~~~card-yaml\` opener (except when it is the very first line). Pass the full string as \`content\` to \`create_document\`.`;

  return { instruction, blueprint };
}

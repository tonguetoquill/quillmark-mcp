export async function getSpec(quiver, engine, quill) {
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
  const instruction = `The blueprint below is a ready-to-edit template for the \`${quill}\` quill. Copy it verbatim, fill in every field marked \`required\`, edit the body prose, and pass the whole string as \`content\` to \`create_document\`. Format rules: metadata lives in \`~~~card-yaml\` fenced blocks (NOT \`---\` frontmatter). The first \`~~~card-yaml\` block is the root and must contain \`$quill: <name>@<version>\` and \`$kind: main\`; reserved \`$\`-keys are \`$quill\`, \`$kind\`, \`$id\`, \`$ext\`. User fields are lowercase snake_case. Additional \`~~~card-yaml\` blocks declare composable cards via \`$kind: <card_kind>\` and may appear zero or more times wherever the blueprint shows them.`;

  return { instruction, blueprint };
}

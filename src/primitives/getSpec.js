const FORMAT_RULES = [
  'Document format rules (read carefully — small LLMs frequently fail on these):',
  '• Metadata blocks use `~~~card-yaml` as the opener and `~~~` as the closer. Do NOT use `---` YAML frontmatter.',
  '• The closer is EXACTLY `~~~` (three tildes, no info string). Do NOT write `~~~card-yaml` as the closer.',
  '• A blank line is required before every `~~~card-yaml` opener (except when it is the first line of the document).',
  '• The first block is the root and MUST contain `$quill: <name>@<version>` and `$kind: main`.',
  '• Reserved `$`-keys: `$quill`, `$kind`, `$id`, `$ext`. User fields use lowercase snake_case.',
  '• Additional `~~~card-yaml` blocks declare composable cards via `$kind: <card_kind>`.',
  '• Prose body is the text after a block\'s closing `~~~`, before the next opener or EOF.',
  '• For optional fields with no value, OMIT the line entirely — do not write `field: null`.',
  '• Respect field types: numbers unquoted (`word_count: 42`), booleans unquoted (`pinned: true`),',
  '  strings as plain scalars or quoted. Quoting a number turns it into a string and will fail validation.',
].join('\n');

function availableQuillsHint(quiver) {
  try {
    const names = typeof quiver?.quillNames === 'function' ? quiver.quillNames() : [];
    if (!Array.isArray(names) || names.length === 0) return '';
    return ` Available quills: ${names.join(', ')}. Drop the @version suffix to bind to the latest available version.`;
  } catch {
    return '';
  }
}

export async function getSpec(quiver, engine, quill) {
  if (typeof quill !== 'string' || quill.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  let resolved;
  try {
    resolved = await quiver.getQuill(quill, { engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${quill}": ${message}.${availableQuillsHint(quiver)}`, { cause: error });
  }

  const blueprint = typeof resolved?.blueprint === 'string' ? resolved.blueprint : '';
  const instruction = [
    `The blueprint below is a ready-to-edit template for the \`${quill}\` quill. Copy it verbatim, fill in every field marked \`required\`, edit the body prose, and pass the whole string as \`content\` to \`create_document\`.`,
    '',
    FORMAT_RULES,
  ].join('\n');

  return { instruction, blueprint };
}

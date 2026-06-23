import { availableQuillsHint } from './availableQuillsHint.js';

const FORMAT_RULES = [
  'Document format rules (read carefully — small LLMs frequently fail on these):',
  '• Metadata blocks use `~~~card-yaml` as the opener and `~~~` as the closer. Do NOT use `---` YAML frontmatter.',
  '• The closer is EXACTLY `~~~` (three tildes, no info string). Do NOT write `~~~card-yaml` as the closer.',
  '• A blank line is required before every `~~~card-yaml` opener (except when it is the first line of the document).',
  '• The first block is the root and MUST contain `$quill: <name>@<version>` and `$kind: main`.',
  '• Reserved `$`-keys: `$quill`, `$kind`, `$id`, `$ext`. User fields use lowercase snake_case.',
  '• Additional `~~~card-yaml` blocks declare composable cards via `$kind: <card_kind>`.',
  '• Prose body is the text after a block\'s closing `~~~`, before the next opener or EOF.',
  '• Fields whose value is `!must_fill` are unfilled — replace the whole marker with a real value (including any suggested value shown after it, e.g. `subject: !must_fill Subject of the Memorandum`). Never leave a `!must_fill` marker in the document you submit.',
  '• Fields that already show a concrete value (e.g. `letterhead_title: DEPARTMENT OF THE AIR FORCE`) are pre-filled defaults; keep them unless the request calls for a change.',
  '• A trailing `# ...` on a value line is a comment: `# string` / `# array<string>` is the field type, `# e.g. ...` is a suggestion. Comments are ignored — do not turn them into values.',
  '• For an optional field you do not need, OMIT the line entirely (delete it) — do not write `field: null` or leave a `!must_fill` marker.',
  '• Respect field types: numbers unquoted (`word_count: 42`), booleans unquoted (`pinned: true`),',
  '  strings as plain scalars or quoted. Quoting a number turns it into a string and will fail validation.',
].join('\n');

export async function getSpec(quiver, engine, quill) {
  if (typeof quill !== 'string' || quill.trim() === '') {
    throw new Error('Quill format reference must be a non-empty string.');
  }

  let resolved;
  try {
    resolved = await quiver.getQuill(quill);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve Quill format reference "${quill}": ${message}.${availableQuillsHint(quiver)}`, { cause: error });
  }

  const blueprint = typeof resolved?.blueprint === 'string' ? resolved.blueprint : '';
  const instruction = [
    `The blueprint below is a ready-to-edit template for the \`${quill}\` quill. Copy it verbatim, replace every \`!must_fill\` marker with a real value, edit the body prose, and pass the whole string as \`content\` to \`create_document\`.`,
    '',
    FORMAT_RULES,
  ].join('\n');

  return { instruction, blueprint };
}

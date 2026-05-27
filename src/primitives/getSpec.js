import { Document } from '@quillmark/wasm';

// `formatRules`, `blueprintInstruction(name)`, and `formatDiagnostic(d)`
// (the one in QuillmarkMCP.js) all ship in @quillmark/wasm > 0.84. Until
// that publishes, fall back to inline copies sourced from quillmark/auto-refine-3.
// Remove these fallbacks once the dep is bumped past the cutover.
const FALLBACK_FORMAT_RULES = `Document format rules:
• Block opener is \`~~~card-yaml\`; closer is EXACTLY \`~~~\` (three tildes, no info string). Do NOT repeat \`~~~card-yaml\` as the closer.
• A blank line must precede every \`~~~card-yaml\` opener (unless it is line 1).
• The first block is the root and MUST contain \`$quill: <name>@<version>\` and \`$kind: main\`. Additional blocks declare composable cards via \`$kind: <card_kind>\`.
• Reserved \`$\`-keys: \`$quill\`, \`$kind\`, \`$id\`, \`$ext\`. User fields use lowercase snake_case.
• Prose body is the text after a block's closing \`~~~\`, up to the next opener or EOF.
• \`; delete-ok\` fields carry a default — keep the line, override the value, or delete the entire line to use the default. Do not write \`field:\`, \`field: null\`, or \`field: ~\` — all three parse as explicit YAML null and fail validation.
• Numbers and booleans MUST be unquoted (\`year: 2025\`, \`pinned: true\`); quoting turns them into strings and fails validation.
• Plain-scalar values cannot start with \`*\` or \`&\` (YAML alias/anchor markers) and cannot contain \`: \` (colon-space). For markdown emphasis, embedded colons, or other special prefixes, quote the value: \`field: '**bold**'\` or \`field: "Name: subtitle"\`. Multi-line values use \`|-\`, not multi-line quoted scalars.`;

const FORMAT_RULES = typeof Document.formatRules === 'function'
  ? Document.formatRules()
  : FALLBACK_FORMAT_RULES;

const blueprintInstruction = typeof Document.blueprintInstruction === 'function'
  ? (name) => Document.blueprintInstruction(name)
  : (name) => `Fill in the \`${name}\` blueprint below: replace each \`<must-fill>\` sentinel and edit the body prose. Submit the filled markdown as \`content\` to \`create_document\`.`;

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
    blueprintInstruction(quill),
    '',
    'Your next action must be `create_document`. Do not respond with a text turn — submit the tool call directly.',
    '',
    FORMAT_RULES,
  ].join('\n');

  return { instruction, blueprint };
}

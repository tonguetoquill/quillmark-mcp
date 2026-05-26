import { Document } from '@quillmark/wasm';

// Format rules are sourced from the WASM layer so CLI / Python / MCP all
// surface the same text. Read once; the value never changes between calls.
const FORMAT_RULES = Document.formatRules();

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
    Document.blueprintInstruction(quill),
    '',
    'Your next action must be `create_document`. Do not respond with a text turn — submit the tool call directly.',
    '',
    FORMAT_RULES,
  ].join('\n');

  return { instruction, blueprint };
}

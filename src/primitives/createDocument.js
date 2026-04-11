function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!frontmatterMatch) {
    return {};
  }

  const frontmatterBlock = frontmatterMatch[1] ?? '';
  const entries = frontmatterBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  const fields = {};
  for (const entry of entries) {
    const keyValueMatch = entry.match(/^([^:]+):\s*(.*)$/);
    if (!keyValueMatch) {
      continue;
    }

    const key = keyValueMatch[1].trim();
    const value = keyValueMatch[2].trim();
    fields[key] = value;
  }

  return fields;
}

function formatError(message) {
  return { status: 'error', errors: [{ message }] };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function extractQuillRef(frontmatterFields) {
  const quillKey = Object.keys(frontmatterFields).find((key) => key.toUpperCase() === 'QUILL');
  return quillKey ? frontmatterFields[quillKey] : undefined;
}

function validateWithEngine(registry, content) {
  const engine = registry?.engine;
  if (!engine || typeof engine.dryRun !== 'function') {
    return [];
  }

  try {
    engine.dryRun(content);
    return [];
  } catch (error) {
    return [{ message: getErrorMessage(error) }];
  }
}

/**
 * @param {{ resolve: (ref: string) => Promise<object>, engine?: { dryRun: (content: string) => void } }} registry
 * @param {{ handle: (quill: object, validatedContent: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> }} strategy
 * @param {string} content - Full Quillmark document: YAML frontmatter with QUILL: naming the Quill format, plus markdown body
 * @returns {Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }>}
 */
export async function createDocument(registry, strategy, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return formatError('Content must be a non-empty string.');
  }

  const frontmatterFields = parseFrontmatter(content);
  const quillRef = extractQuillRef(frontmatterFields);

  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return formatError('QUILL: is required in frontmatter to select the Quill format.');
  }

  let quill;
  try {
    quill = await registry.resolve(quillRef);
  } catch (error) {
    return formatError(`Unable to resolve Quill format reference "${quillRef}": ${getErrorMessage(error)}`);
  }

  const validationErrors = validateWithEngine(registry, content);
  if (validationErrors.length > 0) {
    return {
      status: 'error',
      errors: validationErrors,
    };
  }

  return strategy.handle(quill, content);
}

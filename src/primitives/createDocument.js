/**
 * @module createDocument
 */

/**
 * Extracts YAML frontmatter fields from a Quillmark document string.
 *
 * Uses a regex to match the `---`-delimited block at the start of the content,
 * then parses it line-by-line with a naive `key: value` splitter. This is NOT
 * a full YAML parser — it handles flat key-value pairs only. Comment lines
 * (starting with `#`) and blank lines are skipped. Enough to extract the QUILL
 * ref and surface-level metadata before the real WASM engine validates the
 * full document.
 *
 * @param {string} content - Raw Quillmark document string.
 * @returns {Object<string, string>} Flat map of frontmatter key-value pairs, or `{}` if no frontmatter block is found.
 */
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

/**
 * Builds a structured error result matching the createDocument return shape.
 *
 * @param {string} message - Human-readable error description.
 * @returns {object} `{ status: 'error', errors: [{ message }] }`
 */
function formatError(message) {
  return { status: 'error', errors: [{ message }] };
}

/**
 * Coerces an arbitrary error value into a human-readable string.
 *
 * Handles the full zoo of things the WASM engine and strategy layer can
 * throw: standard Error instances, Map objects (field-level validation errors
 * where keys are field names and values are messages), plain objects
 * (JSON-serialised), and primitives (stringified). Map handling is critical
 * because the validation engine surfaces per-field errors as Map entries.
 *
 * @param {unknown} error - The thrown/returned error value.
 * @returns {string} A best-effort human-readable error message.
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error instanceof Map) {
    // If the Map has a 'message' key, use that (common in validation errors)
    if (error.has('message')) {
      return String(error.get('message'));
    }
    // Otherwise serialize the Map
    const entries = Array.from(error.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    return entries || 'Unknown validation error';
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Strips surrounding flow-style YAML quotes (single or double) from a string.
 *
 * Only affects the naive pre-extraction path used by `extractQuillRef` — the
 * real WASM YAML parser handles quoting correctly on its own. Without this,
 * a frontmatter value like `QUILL: "my-quill"` would fail resolution because
 * the quotes would be treated as part of the ref.
 *
 * @param {*} value - The raw frontmatter value token.
 * @returns {*} The value with surrounding quotes removed if applicable, or the original value.
 */
function stripYamlQuotes(value) {
  if (typeof value !== 'string') return value;
  // YAML permits flow-style double-quoted and single-quoted scalars. Our naive
  // line-based parser extracts the raw token including quotes, so peel them off
  // here so downstream consumers see the plain ref. The real YAML parser in the
  // WASM engine handles this correctly on its own — this only affects the local
  // pre-extraction path that decides which Quill to resolve.
  if (value.length >= 2) {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Looks up the QUILL key in parsed frontmatter fields (case-insensitive)
 * and returns its quote-stripped value.
 *
 * Case-insensitive lookup lets authors write `quill:`, `Quill:`, or `QUILL:`
 * interchangeably, reducing friction.
 *
 * @param {Object<string, string>} frontmatterFields - Parsed frontmatter key-value map.
 * @returns {string | undefined} The Quill format reference, or `undefined` if not present.
 */
function extractQuillRef(frontmatterFields) {
  const quillKey = Object.keys(frontmatterFields).find((key) => key.toUpperCase() === 'QUILL');
  return quillKey ? stripYamlQuotes(frontmatterFields[quillKey]) : undefined;
}

/**
 * Runs the WASM engine's dry-run validation against the full document content.
 *
 * Non-throwing: returns an empty array on success or if no engine is available,
 * and a single-element error array on validation failure. This keeps the
 * validation step composable within the main pipeline without try/catch noise.
 *
 * @param {object} registry - Registry with optional WASM engine exposing `engine.dryRun(content)`.
 * @param {string} content - Full Quillmark document string to validate.
 * @returns {Array<object>} Empty on success, error descriptors (`{ message }`) on failure.
 */
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
 * Validates and persists a Quillmark document through the full pipeline:
 *
 * 1. Validate `content` is a non-empty string
 * 2. Parse frontmatter and extract the QUILL reference
 * 3. Resolve the QUILL ref against the registry
 * 4. Run WASM engine dry-run validation (schema + business rules)
 * 5. Delegate to the injected strategy for persistence (e.g. GitHub, filesystem)
 *
 * Non-throwing by design: every failure is returned as a structured
 * `{ status: 'error', errors: [...] }` response rather than a thrown
 * exception. This is intentional — MCP tool handlers should never throw
 * because the protocol has no concept of exceptions; errors must be
 * expressed as tool results.
 *
 * @param {object} registry
 *   The package registry used to resolve the QUILL ref and validate via WASM.
 *   Must expose `resolve(ref)` returning a Promise and optionally `engine.dryRun(content)`.
 * @param {object} strategy
 *   The persistence strategy that receives the resolved quill bundle and validated content.
 *   Must expose `handle(quill, validatedContent)` returning a Promise.
 * @param {string} content - Full Quillmark document: YAML frontmatter (with QUILL: key) + markdown body.
 * @returns {Promise<object>}
 *   Success or structured error result (`{ status, url?, errors? }`). Error messages from Maps and objects are serialised via `getErrorMessage`.
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

  let result;
  try {
    result = await strategy.handle(quill, content);
  } catch (error) {
    return formatError(`Strategy failed: ${getErrorMessage(error)}`);
  }

  // Ensure error messages are properly serialized (handles Maps and other objects)
  if (result.status === 'error' && result.errors && Array.isArray(result.errors)) {
    result.errors = result.errors.map((error) => ({
      message: getErrorMessage(error.message || error),
    }));
  }

  return result;
}

/**
 * @module composeYaml
 *
 * Minimal JSON-to-YAML block-style emitter for frontmatter assembly.
 *
 * Takes a plain JS object and emits valid YAML that parses back to equivalent
 * data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
 * as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
 * and only top-level sequences are rendered in block style (for readability
 * when a human ends up editing the frontmatter).
 *
 * Intentionally not a full YAML library — the input shape is controlled
 * (primitives, arrays of primitives/objects, nested objects) and that subset
 * is exactly what every frontmatter schema shipped so far uses.
 */

/**
 * Encodes a single value as a YAML scalar.
 *
 * Delegates to `JSON.stringify` for strings (producing safe double-quoted
 * output) and for complex nested values (flow-style JSON, which is valid YAML).
 * Nulls, booleans, and numbers are stringified directly.
 *
 * @param {*} value - The value to encode.
 * @returns {string} YAML-safe scalar representation.
 */
function emitScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  // Arrays / nested objects inside a value slot → flow-style JSON
  return JSON.stringify(value);
}

/**
 * Emits zero or more YAML lines for a single key-value pair.
 *
 * Returns an empty array for `undefined` (field omitted), a single line for
 * scalars/null/nested objects (flow-style), and multiple lines for arrays
 * (block-style with `- ` prefix). This multi-line return lets the caller
 * flatten all fields with a single `lines.push(...emitField(...))`.
 *
 * @param {string} key - The YAML field name.
 * @param {*} value - The field value; `undefined` suppresses output entirely.
 * @returns {string[]} Lines of YAML output for this field.
 */
function emitField(key, value) {
  if (value === undefined) return [];
  if (value === null) return [`${key}: null`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    const lines = [`${key}:`];
    for (const item of value) {
      lines.push(`  - ${emitScalar(item)}`);
    }
    return lines;
  }

  if (typeof value === 'object') {
    // Nested object — flow style. Valid YAML, compact, unambiguous.
    return [`${key}: ${JSON.stringify(value)}`];
  }

  return [`${key}: ${emitScalar(value)}`];
}

/**
 * Converts a flat JS object into a YAML block string without `---` delimiters.
 *
 * Throws a TypeError on non-object inputs (null, arrays, primitives) to
 * catch misuse early rather than producing silently broken YAML.
 *
 * @param {Object<string, unknown>} fields - Plain object whose entries become YAML key-value pairs.
 * @returns {string} YAML body without the `---` delimiters.
 * @throws {TypeError} If `fields` is not a plain object.
 */
export function toYamlBlock(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('toYamlBlock expects a plain object');
  }
  const lines = [];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(...emitField(key, value));
  }
  return lines.join('\n');
}

/**
 * Assembles a full Quillmark content string from a structured payload.
 *
 * QUILL is injected as the first frontmatter field, overriding any existing
 * QUILL key in `fields` — the separate `quill` param is authoritative. This
 * guarantees the document always references the intended Quill format
 * regardless of what the caller passes in the fields object.
 *
 * Non-object `fields` are silently treated as empty; non-string `body` becomes
 * `''`. This defensive handling means callers don't need to pre-validate
 * optional inputs.
 *
 * @param {object} input
 *   `quill` (string) — the Quill format reference (injected as `QUILL:` in frontmatter).
 *   `fields` (object, optional) — additional frontmatter key-value pairs.
 *   `body` (string) — the markdown body content below the frontmatter.
 * @returns {string} Complete Quillmark document string with `---` delimiters.
 */
export function composeContent({ quill, fields, body }) {
  const safeFields = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
  const { QUILL: _ignored, ...rest } = safeFields;
  const merged = { QUILL: quill, ...rest };
  const yaml = toYamlBlock(merged);
  const safeBody = typeof body === 'string' ? body : '';
  return `---\n${yaml}\n---\n\n${safeBody}`;
}

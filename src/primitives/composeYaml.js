// Minimal JSON → YAML block-style emitter for frontmatter assembly.
//
// Goal: take a plain JS object and emit valid YAML that parses back to
// equivalent data. We exploit YAML 1.2 being a strict superset of JSON:
// strings are emitted as JSON-escaped double-quoted scalars, nested objects
// use JSON flow style, and only top-level sequences are rendered in block
// style (for readability when a human ends up editing the frontmatter).
//
// This is intentionally not a full YAML library — we control the input
// shape (primitives, arrays of primitives/objects, nested objects) and
// that subset is exactly what every frontmatter schema we've shipped uses.

function emitScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  // Arrays / nested objects inside a value slot → flow-style JSON
  return JSON.stringify(value);
}

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
 * @param {Record<string, unknown>} fields
 * @returns {string} YAML body without the `---` delimiters
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
 * Assemble a full Quillmark content string from a structured payload.
 * QUILL is injected as the first frontmatter field and overrides any
 * QUILL key in `fields` (so the separate `quill` param is authoritative).
 *
 * @param {{ quill: string, fields?: Record<string, unknown>, body: string }} input
 * @returns {string}
 */
export function composeContent({ quill, fields, body }) {
  const safeFields = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
  const { QUILL: _ignored, ...rest } = safeFields;
  const merged = { QUILL: quill, ...rest };
  const yaml = toYamlBlock(merged);
  const safeBody = typeof body === 'string' ? body : '';
  return `---\n${yaml}\n---\n\n${safeBody}`;
}

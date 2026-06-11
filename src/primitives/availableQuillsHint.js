/**
 * Builds a " Available quills: ..." suffix for quill-resolution error messages,
 * so an LLM that passed a bad ref can self-correct on the next attempt.
 * Returns '' when the catalog is empty or unreadable — the hint is best-effort.
 */
export function availableQuillsHint(quiver) {
  try {
    const names = typeof quiver?.quillNames === 'function' ? quiver.quillNames() : [];
    if (!Array.isArray(names) || names.length === 0) return '';
    return ` Available quills: ${names.join(', ')}. Drop the @version suffix to bind to the latest available version.`;
  } catch {
    return '';
  }
}

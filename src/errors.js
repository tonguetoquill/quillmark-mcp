/**
 * @module errors
 * Shared error formatting helpers used across primitives and strategies.
 */

/**
 * Coerce an arbitrary thrown value into a human-readable string.
 *
 * `@quillmark/wasm` and `@quillmark/quiver` always throw `Error` instances
 * (with `.diagnostics` attached); user-supplied delivery strategies are
 * less disciplined, so we keep a defensive fallback for plain objects and
 * primitives.
 *
 * @param {unknown} error - The thrown/returned value.
 * @returns {string} A best-effort human-readable error message.
 */
export function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

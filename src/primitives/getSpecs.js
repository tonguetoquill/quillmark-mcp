import { encode } from '@toon-format/toon';

/**
 * @param {{ resolve: (ref: string) => Promise<{ name: string }>, engine?: { getStrippedSchema: (name: string) => unknown, getQuillInfo: (name: string) => { example?: string, metadata?: Record<string, unknown> } } }} registry
 * @param {string} ref - Quill reference identifier
 * @param {{ encodeSchema?: (schema: unknown) => string }} [deps]
 * @returns {Promise<{ schema: string, instructions: string }>} TOON-encoded schema + authoring instructions
 * @throws {Error} If the quill reference is invalid or unavailable
 */
export async function getSpecs(registry, ref, deps = {}) {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error('Quill reference must be a non-empty string.');
  }

  const encodeSchema = deps.encodeSchema ?? encode;

  let bundle;
  try {
    bundle = await registry.resolve(ref);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve quill reference "${ref}": ${message}`, { cause: error });
  }

  const engine = registry.engine;
  if (!engine || typeof engine.getStrippedSchema !== 'function' || typeof engine.getQuillInfo !== 'function') {
    throw new Error('Registry does not have an attached wasm engine with getStrippedSchema/getQuillInfo methods.');
  }

  const schemaObject = engine.getStrippedSchema(bundle.name);
  const quillInfo = engine.getQuillInfo(bundle.name);
  const instructions = typeof quillInfo?.example === 'string'
    ? quillInfo.example
    : (typeof quillInfo?.metadata?.instructions === 'string' ? quillInfo.metadata.instructions : '');

  return {
    schema: encodeSchema(schemaObject),
    instructions,
  };
}

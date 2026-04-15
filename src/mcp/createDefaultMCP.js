/**
 * @module mcp/createDefaultMCP
 * Factory for assembling a production-ready QuillmarkMCP with default dependencies.
 */

import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

import { logger } from '../logger.js';
import { McpSdkServerAdapter } from './McpSdkServerAdapter.js';
import { QuillmarkMCP } from './QuillmarkMCP.js';

/**
 * Factory that assembles a fully-wired {@link QuillmarkMCP} with production defaults:
 * `@quillmark/wasm` engine, `FileSystemSource`, `QuillRegistry`, and `McpSdkServerAdapter`.
 *
 * Sequence:
 * 1. Initialize WASM runtime (synchronous, idempotent).
 * 2. Create a `FileSystemSource` pointed at `quillsDir` and wrap it in a `QuillRegistry`.
 * 3. Force-load the manifest so quill discovery errors surface here, not at first tool call.
 * 4. Create an `McpSdkServerAdapter` (name: 'Quillmark', version: '1.0.0').
 * 5. Wire everything into a `QuillmarkMCP` and return it (tools are registered at construction).
 *
 * Read this function as the reference implementation — copy and swap pieces as needed.
 *
 * @param {object} options
 * @param {string} options.quillsDir - Absolute or relative path to the directory containing quill definitions.
 * @param {object} options.strategy - Delivery strategy instance (e.g. `RenderAndHostStrategy`).
 *   Must expose `handle(quill, content)` returning a Promise of `{ status, url?, errors? }`.
 * @returns {Promise<QuillmarkMCP>} Ready-to-start MCP instance (call `.start()` to begin serving).
 * @throws {Error} If the manifest cannot be loaded from `quillsDir`.
 */
export async function createDefaultMCP({ quillsDir, strategy }) {
  init();

  const engine = new Quillmark();
  const source = new FileSystemSource(quillsDir);
  const registry = new QuillRegistry({ source, engine });

  try {
    const manifest = await registry.getManifest();
    logger.debug(`FileSystemSource manifest loaded: ${JSON.stringify(manifest.quills.map(q => ({ name: q.name, version: q.version })))}`);
  } catch (error) {
    logger.error(`Failed to load manifest from ${quillsDir}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  const server = new McpSdkServerAdapter({ name: 'Quillmark', version: '1.0.0' });

  return new QuillmarkMCP({ registry, strategy, server });
}

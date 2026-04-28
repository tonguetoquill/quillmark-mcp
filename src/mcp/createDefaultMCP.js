/**
 * @module mcp/createDefaultMCP
 * Factory for assembling a production-ready QuillmarkMCP with default dependencies.
 */

import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';

import { logger } from '../logger.js';
import { McpSdkServerAdapter } from './McpSdkServerAdapter.js';
import { QuillmarkMCP } from './QuillmarkMCP.js';

/**
 * Factory that assembles a fully-wired {@link QuillmarkMCP} with production defaults:
 * `@quillmark/wasm` engine, `@quillmark/quiver` Quiver, and `McpSdkServerAdapter`.
 *
 * Sequence:
 * 1. Initialize WASM runtime (synchronous, idempotent).
 * 2. Create a `Quillmark` engine.
 * 3. Load the source `Quiver` from `quiverDir` (must contain `Quiver.yaml` +
 *    `quills/<name>/<x.y.z>/...`).
 * 4. Create an `McpSdkServerAdapter` (name: 'Quillmark', version: '1.0.0').
 * 5. Wire everything into a `QuillmarkMCP` and return it.
 *
 * @param {object} options
 * @param {string} options.quiverDir - Absolute or relative path to the Quiver
 *   source root (the directory containing `Quiver.yaml` and a `quills/`
 *   subdirectory).
 * @param {object} options.strategy - Delivery strategy instance (e.g. `RenderAndHostStrategy`).
 *   Must expose `handle(quill, doc)` returning a Promise of `{ status, url?, errors? }`.
 * @returns {Promise<QuillmarkMCP>} Ready-to-start MCP instance.
 * @throws {Error} If the Quiver cannot be loaded from `quiverDir`.
 */
export async function createDefaultMCP({ quiverDir, strategy }) {
  init();

  const engine = new Quillmark();

  let quiver;
  try {
    quiver = await Quiver.fromDir(quiverDir);
    logger.debug(`Quiver loaded (name: ${quiver.name}, quills: ${quiver.quillNames().join(', ')})`);
  } catch (error) {
    logger.error(`Failed to load Quiver from ${quiverDir}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  const server = new McpSdkServerAdapter({ name: 'Quillmark', version: '1.0.0' });

  return new QuillmarkMCP({ quiver, engine, strategy, server });
}

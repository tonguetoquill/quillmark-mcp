import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

import { logger } from '../logger.js';
import { McpSdkServerAdapter } from './McpSdkServerAdapter.js';
import { QuillmarkMCP } from './QuillmarkMCP.js';

/**
 * Fully-wired QuillmarkMCP with default dependencies:
 * @quillmark/wasm engine, FileSystemSource, QuillRegistry, and an MCP SDK server.
 *
 * Read this function as the reference implementation for building your own
 * MCP server — copy it as a starting point and swap pieces as needed.
 *
 * @param {{
 *   quillsDir: string,
 *   strategy: { handle: (quill: object, content: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> },
 * }} options
 * @returns {QuillmarkMCP}
 */
export async function createDefaultMCP({ quillsDir, strategy }) {
  init();

  const engine = new Quillmark();
  const source = new FileSystemSource(quillsDir);
  const registry = new QuillRegistry({ source, engine });

  // Force manifest loading to discover quills
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

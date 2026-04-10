import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';
import { FastMCP } from 'fastmcp';

import { QuillmarkMCP } from './QuillmarkMCP.js';

/**
 * Fully-wired QuillmarkMCP with default dependencies:
 * @quillmark/wasm engine, FileSystemSource, QuillRegistry, and a FastMCP server.
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
export function createDefaultMCP({ quillsDir, strategy }) {
  init();

  const engine = new Quillmark();
  const source = new FileSystemSource(quillsDir);
  const registry = new QuillRegistry({ source, engine });
  const server = new FastMCP({ name: 'Quillmark', version: '1.0.0' });

  return new QuillmarkMCP({ registry, strategy, server });
}

import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';
import { FastMCP } from 'fastmcp';

import { QuillmarkMCP } from './QuillmarkMCP.js';

/**
 * @typedef {{
 *   FastMCPClass?: typeof FastMCP,
 *   FileSystemSourceClass?: typeof FileSystemSource,
 *   QuillRegistryClass?: typeof QuillRegistry,
 *   QuillmarkClass?: typeof Quillmark,
 *   initWasm?: () => void,
 * }} CreateDefaultMCPDeps
 */

/**
 * Creates a fully-wired QuillmarkMCP with default dependencies.
 * Initializes @quillmark/wasm, builds a FileSystemSource + QuillRegistry,
 * and wires up a FastMCP server.
 *
 * See the bin.js entry point for a complete usage example.
 *
 * @param {{
 *   quillsDir: string,
 *   strategy: { handle: (quill: object, content: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> },
 *   server?: { name?: string, version?: `${number}.${number}.${number}` },
 *   deps?: CreateDefaultMCPDeps,
 * }} options
 * @returns {QuillmarkMCP}
 */
export function createDefaultMCP(options) {
  if (typeof options?.quillsDir !== 'string' || options.quillsDir.trim() === '') {
    throw new TypeError('createDefaultMCP requires a non-empty quillsDir option.');
  }

  if (!options.strategy || typeof options.strategy.handle !== 'function') {
    throw new TypeError('createDefaultMCP requires a delivery strategy with a handle() method.');
  }

  const deps = options.deps ?? {};
  const FastMCPClass = deps.FastMCPClass ?? FastMCP;
  const FileSystemSourceClass = deps.FileSystemSourceClass ?? FileSystemSource;
  const QuillRegistryClass = deps.QuillRegistryClass ?? QuillRegistry;
  const QuillmarkClass = deps.QuillmarkClass ?? Quillmark;
  const initWasm = deps.initWasm ?? init;

  initWasm();

  const engine = new QuillmarkClass();
  const source = new FileSystemSourceClass(options.quillsDir);
  const registry = new QuillRegistryClass({ source, engine });
  const server = new FastMCPClass({
    name: options.server?.name ?? 'Quillmark',
    version: options.server?.version ?? '1.0.0',
  });

  return new QuillmarkMCP({ registry, strategy: options.strategy, server });
}

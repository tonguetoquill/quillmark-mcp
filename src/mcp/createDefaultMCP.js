/**
 * @module mcp/createDefaultMCP
 * Bootstraps the wasm engine + Quiver and wires both into an
 * `McpSdkServerAdapter` whose tools come from `@quillmark/mcp`.
 */

import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';

import { logger } from '../logger.js';
import { McpSdkServerAdapter } from './McpSdkServerAdapter.js';

export async function createDefaultMCP({ quiverDir, deliver }) {
  init();

  const engine = new Quillmark();
  const quiver = await Quiver.fromDir(quiverDir);
  logger.debug(`Quiver loaded (name: ${quiver.name}, quills: ${quiver.quillNames().join(', ')})`);

  await quiver.warm();
  logger.debug('Prefetched all Quill trees');

  return new McpSdkServerAdapter({
    name: 'Quillmark',
    version: '1.0.0',
    quiver,
    engine,
    deliver,
  });
}

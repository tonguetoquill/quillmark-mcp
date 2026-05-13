import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver/node';

import { logger } from '../logger.js';
import { McpSdkServerAdapter } from './McpSdkServerAdapter.js';
import { QuillmarkMCP } from './QuillmarkMCP.js';

export async function createDefaultMCP({ quiverDir, strategy }) {
  init();

  const engine = new Quillmark();
  const quiver = await Quiver.fromDir(quiverDir);
  logger.debug(`Quiver loaded (name: ${quiver.name}, quills: ${quiver.quillNames().join(', ')})`);

  const server = new McpSdkServerAdapter({
    name: 'Quillmark',
    version: '1.0.0',
    instructions: QuillmarkMCP.instructions,
  });

  return new QuillmarkMCP({ quiver, engine, strategy, server });
}

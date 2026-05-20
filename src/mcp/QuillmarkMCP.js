import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';
import { logger } from '../logger.js';
import { getErrorMessage } from '../errors.js';

const SERVER_INSTRUCTIONS = 'Workflow: list_quills → get_specs → create_document → surface the returned URL to the user as a markdown link.';

function formatDiagnostic(d) {
  const parts = [`[${d.severity ?? 'error'}] ${d.message ?? ''}`];
  if (d.hint) parts.push(`  Hint: ${d.hint}`);
  if (d.location) parts.push(`  At: ${d.location.file}:${d.location.line}:${d.location.column}`);
  return parts.join('\n');
}

function errorResult(message, diagnostics) {
  const text = diagnostics && diagnostics.length > 0
    ? [message, '', ...diagnostics.map(formatDiagnostic)].join('\n')
    : message;
  return { isError: true, content: [{ type: 'text', text }] };
}

export class QuillmarkMCP {
  static get instructions() {
    return SERVER_INSTRUCTIONS;
  }

  constructor({ quiver, engine, strategy, server }) {
    if (!quiver || typeof quiver.getQuill !== 'function' || typeof quiver.quillNames !== 'function') {
      throw new TypeError('QuillmarkMCP requires a quiver with getQuill() and quillNames() methods.');
    }

    if (!engine || typeof engine.quill !== 'function') {
      throw new TypeError('QuillmarkMCP requires an engine with a quill() method.');
    }

    if (!strategy || typeof strategy.handle !== 'function') {
      throw new TypeError('QuillmarkMCP requires a delivery strategy with a handle() method.');
    }

    if (!server || typeof server.addTool !== 'function') {
      throw new TypeError('QuillmarkMCP requires a server with an addTool() method.');
    }

    this.quiver = quiver;
    this.engine = engine;
    this.strategy = strategy;
    this.server = server;

    this.registerTools();
  }

  registerTools() {
    this.server.addTool({
      name: 'list_quills',
      description: 'List available document formats (quills).',
      inputSchema: {},
      outputSchema: {
        quills: z.array(z.object({
          name: z.string(),
          version: z.string(),
          description: z.string().optional(),
        })),
      },
      execute: async () => {
        const quills = await listQuills(this.quiver, this.engine);
        const text = quills
          .map((q) => [q.version ? `${q.name}@${q.version}` : q.name, q.description].filter(Boolean).join(': '))
          .join('\n');
        return {
          content: [{ type: 'text', text }],
          structuredContent: { quills },
        };
      },
    });

    this.server.addTool({
      name: 'get_specs',
      description: 'Learn how to compose a document in a specific quill format. Call before `create_document`.',
      inputSchema: {
        quill: z
          .string({
            error: (issue) =>
              issue.input === undefined
                ? 'Missing required field `quill`. Pass either a base name (e.g., `usaf_memo`) or `name@version`.'
                : 'Field `quill` must be a string (base name or `name@version`).',
          })
          .min(1, 'Field `quill` must be non-empty (base name or `name@version`).')
          .describe('Either base name for latest or `name@version`.'),
      },
      outputSchema: {
        instruction: z.string(),
        blueprint: z.string(),
      },
      execute: async ({ quill }) => {
        try {
          const { instruction, blueprint } = await getSpecs(this.quiver, this.engine, quill);
          const text = blueprint ? `${instruction}\n\n${blueprint}` : instruction;
          return {
            content: [{ type: 'text', text }],
            structuredContent: { instruction, blueprint },
          };
        } catch (error) {
          logger.warn(`get_specs failed (quill: ${quill}): ${getErrorMessage(error)}`);
          return errorResult(getErrorMessage(error));
        }
      },
    });

    this.server.addTool({
      name: 'create_document',
      description: 'Render a document and return a URL to the rendered artifact. Call `list_quills` then `get_specs` first to learn how to compose `content` for the chosen quill format.',
      inputSchema: {
        content: z
          .string({
            error: (issue) =>
              issue.input === undefined
                ? 'Missing required field `content`. Pass the full document body as a string: a `~~~card-yaml` block with `#@quill: <ref>` followed by markdown. Call `get_specs` first to learn the format.'
                : 'Field `content` must be a string. Pass the full document body: a `~~~card-yaml` block with `#@quill: <ref>` followed by markdown.',
          })
          .min(1, 'Field `content` must be non-empty. It should contain a `~~~card-yaml` block with `#@quill: <ref>` followed by markdown.')
          .describe('Document body as quill-compliant markdown opening with a `~~~card-yaml` block whose header is `#@quill: <ref>`. Retrieve the format spec via `get_specs` before composing.'),
      },
      execute: async ({ content }) => {
        const result = await createDocument(this.quiver, this.engine, this.strategy, content);
        if (!result.ok) {
          logger.warn(`create_document failed: ${result.message}`);
          return errorResult(result.message, result.diagnostics);
        }
        const mimeType = result.mimeType ?? 'application/octet-stream';
        return {
          content: [
            { type: 'text', text: `[Document](${result.url})` },
            { type: 'resource_link', uri: result.url, name: 'Document', mimeType },
          ],
          structuredContent: { url: result.url, mimeType },
        };
      },
    });
  }

  async start(startOptions = { transportType: 'stdio' }) {
    logger.info('Initializing Quillmark MCP server');

    const names = this.quiver.quillNames();
    logger.info(`Discovered Quill formats (count: ${names.length})`);

    await this.quiver.warm();

    await this.server.start(startOptions);
    logger.info(`MCP server started (transport: ${startOptions.transportType})`);
  }

  async stop() {
    await this.server.stop();
  }
}

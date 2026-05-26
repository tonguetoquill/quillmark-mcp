import { z } from 'zod';

import { createDocument, getSpec, listQuills } from '../primitives/index.js';
import { logger } from '../logger.js';
import { getErrorMessage } from '../errors.js';

const SERVER_INSTRUCTIONS = [
  'Required workflow, in order: `list_quills` (only if you need to discover formats) → `get_spec(quill)` → `create_document(content)`.',
  '`get_spec` is mandatory before every `create_document`. After `get_spec`, your next action MUST be `create_document` — do not respond with a text turn or any other action in between. Build `content` by editing the blueprint `get_spec` returned; do not compose from scratch.',
  'On error: read the diagnostics (including the `hint:` field) and retry `create_document` with corrected content. On success: surface the returned URL to the user as a markdown link and stop.',
].join(' ');

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
      name: 'get_spec',
      description: 'Returns the format spec and a ready-to-edit blueprint for a specific quill. Required before every `create_document`. After this call, your next action MUST be `create_document` — do not respond with a text turn or describe what you are about to do; submit the tool call directly.',
      inputSchema: {
        quill: z
          .string({
            error: (issue) =>
              issue.input === undefined
                ? 'Missing required field `quill`. Pass either a base name (e.g., `usaf_memo`) for the latest version, or an explicit `name@version` pin (e.g., `usaf_memo@0.2.0`). Do NOT use `@latest` — it is not a valid selector.'
                : 'Field `quill` must be a string: a base name (latest) or `name@version` with a numeric semver (e.g., `usaf_memo@0.2.0`). `@latest` is not accepted.',
          })
          .min(1, 'Field `quill` must be non-empty. Use a base name (latest) or `name@version` (e.g., `usaf_memo@0.2.0`).')
          .describe('Quill format reference. Use a base name like `usaf_memo` for the latest version, or pin a specific version like `usaf_memo@0.2.0`. Do NOT use `@latest` — only numeric semver selectors (`x`, `x.y`, `x.y.z`) are accepted.'),
      },
      outputSchema: {
        instruction: z.string(),
        blueprint: z.string(),
      },
      execute: async ({ quill }) => {
        try {
          const { instruction, blueprint } = await getSpec(this.quiver, this.engine, quill);
          const text = blueprint ? `${instruction}\n\n${blueprint}` : instruction;
          return {
            content: [{ type: 'text', text }],
            structuredContent: { instruction, blueprint },
          };
        } catch (error) {
          logger.warn(`get_spec failed (quill: ${quill}): ${getErrorMessage(error)}`);
          return errorResult(getErrorMessage(error));
        }
      },
    });

    this.server.addTool({
      name: 'create_document',
      description: 'Render a document and return a URL to the rendered artifact. Always call `list_quills` then `get_spec` first; copy the returned blueprint and edit it — do NOT compose `content` from scratch. The blueprint and its accompanying instruction are the source of truth for the document format.',
      inputSchema: {
        content: z
          .string({
            error: (issue) =>
              issue.input === undefined
                ? 'Missing required field `content`. Pass the full document as a single string built from the blueprint returned by `get_spec`. Call `get_spec` first if you have not already.'
                : 'Field `content` must be a string. Build it from the blueprint returned by `get_spec`.',
          })
          .min(1, 'Field `content` must be non-empty. Call `get_spec` to get a fillable blueprint, then edit and submit it.')
          .describe('Full quill document as a single string, built by editing the blueprint returned by `get_spec`. The blueprint includes the required `~~~card-yaml` root block, all field types, and the body template.'),
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

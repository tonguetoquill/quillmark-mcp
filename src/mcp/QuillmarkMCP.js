import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';

const LIST_QUILLS_DESCRIPTION = 'List available Quills with names and descriptions. Call this when you need to discover which Quill to use. Returns an array of { name, description } objects. Returns an empty list if no Quills are available.';
const GET_SPECS_DESCRIPTION = 'Get the schema and authoring instructions for a specific Quill. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions from the Quill itself. Use the returned schema to structure your content and follow the authoring instructions for content guidance.';
const CREATE_DOCUMENT_DESCRIPTION = 'Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }.';

export class QuillmarkMCP {
  /**
   * @param {{
   *   registry: object,
   *   strategy: { handle: (quill: object, content: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> },
   *   server: { addTool: (tool: object) => void, start: (options?: object) => Promise<void>, stop: () => Promise<void> },
   * }} options
   */
  constructor({ registry, strategy, server }) {
    if (!registry || typeof registry.resolve !== 'function') {
      throw new TypeError('QuillmarkMCP requires a registry with a resolve() method.');
    }

    if (!strategy || typeof strategy.handle !== 'function') {
      throw new TypeError('QuillmarkMCP requires a delivery strategy with a handle() method.');
    }

    if (!server || typeof server.addTool !== 'function') {
      throw new TypeError('QuillmarkMCP requires a server with an addTool() method.');
    }

    this.registry = registry;
    this.strategy = strategy;
    this.server = server;

    this.registerTools();
  }

  registerTools() {
    this.server.addTool({
      name: 'list_quills',
      description: LIST_QUILLS_DESCRIPTION,
      execute: async () => listQuills(this.registry),
    });

    this.server.addTool({
      name: 'get_specs',
      description: GET_SPECS_DESCRIPTION,
      parameters: z.object({
        ref: z.string(),
      }),
      execute: async ({ ref }) => getSpecs(this.registry, ref),
    });

    this.server.addTool({
      name: 'create_document',
      description: CREATE_DOCUMENT_DESCRIPTION,
      parameters: z.object({
        content: z.string(),
      }),
      execute: async ({ content }) => createDocument(this.registry, this.strategy, content),
    });
  }

  async start(startOptions = { transportType: 'stdio' }) {
    const quills = await this.registry.getAvailableQuills();
    await Promise.all(
      quills.map((quill) => {
        const ref = typeof quill.version === 'string' && quill.version !== ''
          ? `${quill.name}@${quill.version}`
          : quill.name;

        return this.registry.resolve(ref);
      }),
    );

    await this.server.start(startOptions);
  }

  async stop() {
    await this.server.stop();
  }
}

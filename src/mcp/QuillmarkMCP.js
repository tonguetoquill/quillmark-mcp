import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';
import { logger } from '../logger.js';

const LIST_QUILLS_DESCRIPTION = 'List available Quill formats with names and descriptions. A Quill format is a schematized document template for Quillmark. Call this when you need to discover which format to use. Returns an array of { name, description } objects. Returns an empty list if no Quill formats are available.';
const GET_SPECS_DESCRIPTION = 'Get the schema and authoring instructions for a specific Quill format. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions bundled with that format. Use the returned schema to structure your content and follow the authoring instructions for content guidance.';
const CREATE_DOCUMENT_DESCRIPTION = 'Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field (selecting the Quill format) and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }.';

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
      execute: async () => {
        logger.debug('Tool called: list_quills');
        try {
          const result = await listQuills(this.registry);
          logger.info(`list_quills completed (count: ${result.length})`);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`list_quills failed: ${message}`);
          throw error;
        }
      },
    });

    this.server.addTool({
      name: 'get_specs',
      description: GET_SPECS_DESCRIPTION,
      parameters: z.object({
        ref: z.string(),
      }),
      execute: async ({ ref }) => {
        logger.debug(`Tool called: get_specs (ref: ${ref})`);
        try {
          const result = await getSpecs(this.registry, ref);
          logger.info(`get_specs completed (ref: ${ref})`);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`get_specs failed (ref: ${ref}): ${message}`);
          throw error;
        }
      },
    });

    this.server.addTool({
      name: 'create_document',
      description: CREATE_DOCUMENT_DESCRIPTION,
      parameters: z.object({
        content: z.string(),
      }),
      execute: async ({ content }) => {
        logger.debug(`Tool called: create_document (bytes: ${content.length})`);
        try {
          const result = await createDocument(this.registry, this.strategy, content);
          if (result.status === 'success') {
            logger.info(`create_document completed successfully (url: ${result.url})`);
          } else {
            const errorCount = result.errors?.length ?? 0;
            logger.warn(`create_document completed with errors (count: ${errorCount})`);
          }
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`create_document failed: ${message}`);
          throw error;
        }
      },
    });
  }

  async start(startOptions = { transportType: 'stdio' }) {
    logger.info('Initializing Quillmark MCP server');
    const quills = await this.registry.getAvailableQuills();
    logger.info(`Discovered Quill formats (count: ${quills.length})`);

    if (quills.length > 0) {
      const formats = quills.map((q) => q.name);
      logger.debug(`Available Quill formats: ${formats.join(', ')}`);
    }

    await Promise.all(
      quills.map((quill) => {
        const ref = typeof quill.version === 'string' && quill.version !== ''
          ? `${quill.name}@${quill.version}`
          : quill.name;

        return this.registry.resolve(ref);
      }),
    );

    logger.debug('Preloaded all Quill formats');
    logger.info(`Starting MCP server (transport: ${startOptions.transportType})`);
    await this.server.start(startOptions);
    logger.info('MCP server started');
  }

  async stop() {
    await this.server.stop();
  }
}

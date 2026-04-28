/**
 * @module mcp/QuillmarkMCP
 * Orchestrator that wires a Quiver, a Quillmark engine, a DeliveryStrategy,
 * and an MCP server adapter together, exposing Quillmark capabilities as MCP tools.
 */

import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';
import { logger } from '../logger.js';

/** @private */
const LIST_QUILLS_DESCRIPTION = 'List available Quill formats with names and descriptions. A Quill format is a schematized document template for Quillmark. Call this when you need to discover which format to use. Returns an array of { name, description } objects. Returns an empty list if no Quill formats are available.';
/** @private */
const GET_SPECS_DESCRIPTION = 'Get the schema and authoring instructions for a specific Quill format. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions bundled with that format. Use the returned schema to structure your content and follow the authoring instructions for content guidance.';
/** @private */
const CREATE_DOCUMENT_DESCRIPTION = 'Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field (selecting the Quill format) and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }.';

/**
 * Top-level orchestrator that registers Quillmark MCP tools and manages the
 * server lifecycle.
 */
export class QuillmarkMCP {
  /**
   * @param {object} options
   * @param {object} options.quiver - `Quiver` instance from `@quillmark/quiver`.
   *   Must expose `quillNames()`, `versionsOf(name)`, `getQuill(ref, { engine })`,
   *   and `warm()`.
   * @param {object} options.engine - `Quillmark` engine from `@quillmark/wasm`.
   *   Must expose `quill(tree)`.
   * @param {object} options.strategy - Delivery strategy. Must expose `handle(quill, doc)`.
   * @param {object} options.server - MCP server adapter. Must expose `addTool`, `start`, `stop`.
   * @throws {TypeError} If any dependency is missing or doesn't satisfy its interface contract.
   */
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

  /**
   * Register the Quillmark MCP tool suite on the server adapter.
   *
   * Tools registered:
   * 1. **list_quills** — Discover available quill formats (no params).
   * 2. **get_specs** — Retrieve schema + authoring instructions for a quill (param: `ref`).
   * 3. **create_document** — Render a document from raw Quillmark content (param: `content`).
   *
   * @private
   */
  registerTools() {
    this.server.addTool({
      name: 'list_quills',
      description: LIST_QUILLS_DESCRIPTION,
      execute: async () => {
        logger.debug('Tool called: list_quills');
        try {
          const result = await listQuills(this.quiver, this.engine);
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
          const result = await getSpecs(this.quiver, this.engine, ref);
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
          const result = await createDocument(this.quiver, this.engine, this.strategy, content);
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

  /**
   * Preload all quill definitions and start the MCP server.
   *
   * Quiver's `warm()` prefetches every quill tree (filesystem read for
   * `fromDir`/`fromPackage`); this pays the I/O cost once at startup so
   * the first tool call doesn't see a latency spike.
   *
   * @param {object} [startOptions={ transportType: 'stdio' }] - Transport options passed through to the server adapter's `start()`.
   * @returns {Promise<void>}
   */
  async start(startOptions = { transportType: 'stdio' }) {
    logger.info('Initializing Quillmark MCP server');

    const names = this.quiver.quillNames();
    logger.info(`Discovered Quill formats (count: ${names.length})`);
    if (names.length > 0) {
      logger.debug(`Available Quill formats: ${names.join(', ')}`);
    }

    if (typeof this.quiver.warm === 'function') {
      try {
        await this.quiver.warm();
        logger.debug('Prefetched all Quill trees');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Quiver warm() failed: ${message}`);
      }
    }

    logger.info(`Starting MCP server (transport: ${startOptions.transportType})`);
    await this.server.start(startOptions);
    logger.info('MCP server started');
  }

  /**
   * Gracefully shut down the MCP server.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    await this.server.stop();
  }
}

/**
 * @module mcp/QuillmarkMCP
 * Orchestrator that wires a QuillRegistry, a DeliveryStrategy, and an MCP server
 * adapter together, exposing Quillmark capabilities as MCP tools.
 */

import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';
import { composeContent } from '../primitives/composeYaml.js';
import { logger } from '../logger.js';

/** @private */
const LIST_QUILLS_DESCRIPTION = 'List available Quill formats with names and descriptions. A Quill format is a schematized document template for Quillmark. Call this when you need to discover which format to use. Returns an array of { name, description } objects. Returns an empty list if no Quill formats are available.';
/** @private */
const GET_SPECS_DESCRIPTION = 'Get the schema and authoring instructions for a specific Quill format. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions bundled with that format. Use the returned schema to structure your content and follow the authoring instructions for content guidance.';
/** @private */
const CREATE_DOCUMENT_DESCRIPTION = 'Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field (selecting the Quill format) and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }.';
/** @private */
const COMPOSE_DOCUMENT_DESCRIPTION = 'Compose and render a document from structured fields. Use this instead of create_document when you want the server to assemble the YAML frontmatter for you — pass the Quill name, a JSON object of frontmatter fields, and the markdown body. The server handles all YAML syntax, escaping, and delimiter placement. Returns { status, url?, errors? }. Call get_specs first to learn which fields the chosen Quill requires.';

/**
 * Top-level orchestrator that registers Quillmark MCP tools and manages the
 * server lifecycle.
 *
 * Validates that injected dependencies satisfy their contracts at construction
 * time (fail-fast), registers the tool suite, and delegates transport concerns
 * to the provided server adapter.
 */
export class QuillmarkMCP {
  /**
   * @param {object} options
   * @param {object} options.registry - QuillRegistry instance. Must expose `resolve(ref)` and `getAvailableQuills()`.
   * @param {object} options.strategy - Delivery strategy that renders content into a deliverable artifact.
   *   Must expose `handle(quill, content)` returning a Promise of `{ status, url?, errors? }`.
   * @param {object} options.server - MCP server adapter (e.g. McpSdkServerAdapter) that exposes tools over a transport.
   *   Must expose `addTool(tool)`, `start(options?)`, and `stop()`.
   * @param {boolean} [options.localModelMode=false] - When true, registers the extra `compose_document`
   *   tool for clients with weaker YAML generation (e.g. small local Ollama models).
   * @throws {TypeError} If any dependency is missing or doesn't satisfy its interface contract.
   */
  constructor({ registry, strategy, server, localModelMode = false }) {
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
    this.localModelMode = localModelMode === true;

    this.registerTools();
  }

  /**
   * Register the Quillmark MCP tool suite on the server adapter.
   *
   * Tools registered:
   * 1. **list_quills** — Discover available quill formats (no params).
   * 2. **get_specs** — Retrieve schema + authoring instructions for a quill (param: `ref`).
   * 3. **create_document** — Render a document from raw Quillmark content (param: `content`).
   * 4. **compose_document** (localModelMode only) — Render from structured fields so the
   *    server handles YAML assembly (params: `quill`, `fields`, `body`).
   *
   * All tool execute handlers delegate to the primitives layer and wrap errors
   * for structured MCP responses.
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

    // compose_document is opt-in. It's a convenience wrapper for clients whose
    // models struggle to produce valid YAML frontmatter as a raw string (small
    // local Ollama models, specifically). The server assembles the YAML from
    // structured JSON params and delegates to the same createDocument primitive,
    // so there is only one rendering path and no divergence in behavior.
    //
    // Gated by QUILLMARK_LOCAL_MODEL_MODE=1 so hosted-model clients (Claude Code,
    // Claude Desktop, ChatGPT, etc.) continue to see exactly three tools with no
    // change to their contract. Enable on a separate container — do not flip it
    // on the default Claude Code endpoint.
    if (this.localModelMode) {
      this.server.addTool({
        name: 'compose_document',
        description: COMPOSE_DOCUMENT_DESCRIPTION,
        parameters: z.object({
          quill: z.string().describe('Quill format name, e.g. "usaf_memo", "nyt_news_article", "cnn_news_article". Call list_quills to discover available formats, then get_specs with the chosen name to learn which fields it requires.'),
          fields: z.record(z.string(), z.any()).describe('JSON object of frontmatter fields. Keys match the schema returned by get_specs. Values can be strings, numbers, booleans, arrays of primitives, or nested objects — the server will emit valid YAML for all of them. Do not include a QUILL key here; use the quill parameter.'),
          body: z.string().describe('Markdown body of the document. Do not include YAML frontmatter delimiters or fields here — only the body content below the frontmatter.'),
        }),
        execute: async ({ quill, fields, body }) => {
          logger.debug(`Tool called: compose_document (quill: ${quill}, field_count: ${Object.keys(fields ?? {}).length}, body_bytes: ${typeof body === 'string' ? body.length : 0})`);
          try {
            const content = composeContent({ quill, fields, body });
            const result = await createDocument(this.registry, this.strategy, content);
            if (result.status === 'success') {
              logger.info(`compose_document completed successfully (url: ${result.url})`);
            } else {
              const errorCount = result.errors?.length ?? 0;
              logger.warn(`compose_document completed with errors (count: ${errorCount})`);
            }
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`compose_document failed: ${message}`);
            throw error;
          }
        },
      });
      logger.info('compose_document registered (QUILLMARK_LOCAL_MODEL_MODE=1)');
    }
  }

  /**
   * Preload all quill definitions and start the MCP server.
   *
   * Quill preloading resolves every known quill before accepting requests.
   * This pays the WASM init cost once at startup rather than on the first
   * tool call, avoiding latency spikes for clients.
   *
   * @param {object} [startOptions={ transportType: 'stdio' }] - Transport options passed through to the server adapter's `start()`.
   * @returns {Promise<void>}
   */
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

  /**
   * Gracefully shut down the MCP server.
   * Delegates to the server adapter's `stop()` method.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    await this.server.stop();
  }
}

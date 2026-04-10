import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { createDocument, getSpecs, listQuills } from '../primitives/index.js';

const LIST_QUILLS_DESCRIPTION = 'List available Quills with names and descriptions. Call this when you need to discover which Quill to use. Returns an array of { name, description } objects. Returns an empty list if no Quills are available.';
const GET_SPECS_DESCRIPTION = 'Get the schema and authoring instructions for a specific Quill. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions from the Quill itself. Use the returned schema to structure your content and follow the authoring instructions for content guidance.';
const CREATE_DOCUMENT_DESCRIPTION = 'Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }.';

/**
 * @typedef {{
 *   FastMCPClass?: typeof FastMCP,
 *   FileSystemSourceClass?: typeof FileSystemSource,
 *   QuillRegistryClass?: typeof QuillRegistry,
 *   QuillmarkClass?: typeof Quillmark,
 *   initWasm?: () => void,
 *   primitives?: {
 *     listQuills?: typeof listQuills,
 *     getSpecs?: typeof getSpecs,
 *     createDocument?: typeof createDocument,
 *   },
 * }} QuillmarkMCPDeps
 */

export class QuillmarkMCP {
  /**
   * @param {{ quillsDir: string, strategy: { handle: (quill: object, content: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> }, server?: { name?: string, version?: `${number}.${number}.${number}` }, deps?: QuillmarkMCPDeps }} options
   */
  constructor(options) {
    if (typeof options?.quillsDir !== 'string' || options.quillsDir.trim() === '') {
      throw new TypeError('QuillmarkMCP requires a non-empty quillsDir option.');
    }

    if (!options.strategy || typeof options.strategy.handle !== 'function') {
      throw new TypeError('QuillmarkMCP requires a delivery strategy with a handle() method.');
    }

    const deps = options.deps ?? {};
    const FastMCPClass = deps.FastMCPClass ?? FastMCP;
    const FileSystemSourceClass = deps.FileSystemSourceClass ?? FileSystemSource;
    const QuillRegistryClass = deps.QuillRegistryClass ?? QuillRegistry;
    const QuillmarkClass = deps.QuillmarkClass ?? Quillmark;

    this.initWasm = deps.initWasm ?? init;
    this.primitives = {
      listQuills: deps.primitives?.listQuills ?? listQuills,
      getSpecs: deps.primitives?.getSpecs ?? getSpecs,
      createDocument: deps.primitives?.createDocument ?? createDocument,
    };

    this.strategy = options.strategy;
    this.engine = new QuillmarkClass();
    this.source = new FileSystemSourceClass(options.quillsDir);
    this.registry = new QuillRegistryClass({ source: this.source, engine: this.engine });

    this.server = new FastMCPClass({
      name: options.server?.name ?? 'Quillmark MCP',
      version: options.server?.version ?? '1.0.0',
    });

    this.registerTools();
  }

  registerTools() {
    this.server.addTool({
      name: 'list_quills',
      description: LIST_QUILLS_DESCRIPTION,
      execute: async () => this.primitives.listQuills(this.registry),
    });

    this.server.addTool({
      name: 'get_specs',
      description: GET_SPECS_DESCRIPTION,
      parameters: z.object({
        ref: z.string(),
      }),
      execute: async ({ ref }) => this.primitives.getSpecs(this.registry, ref),
    });

    this.server.addTool({
      name: 'create_document',
      description: CREATE_DOCUMENT_DESCRIPTION,
      parameters: z.object({
        content: z.string(),
      }),
      execute: async ({ content }) => this.primitives.createDocument(this.registry, this.strategy, content),
    });
  }

  async start(startOptions = { transportType: 'stdio' }) {
    this.initWasm();

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

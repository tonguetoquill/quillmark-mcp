/**
 * @module strategies/RenderAndHostStrategy
 * Concrete delivery strategy that renders Quillmark content via the WASM engine
 * and writes the resulting artifact to disk, returning a reachable URL.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Quillmark, init } from '@quillmark/wasm';

import { DeliveryStrategy } from './DeliveryStrategy.js';
import { logger } from '../logger.js';

/**
 * Extract a human-readable error message from heterogeneous error types.
 *
 * Handles the full spectrum of values that can land in a catch block:
 * Error instances, Map objects (from WASM validation), plain objects, and primitives.
 *
 * @param {unknown} error - The caught value.
 * @returns {string} A string suitable for user-facing error responses.
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error instanceof Map) {
    // If the Map has a 'message' key, use that (common in validation errors)
    if (error.has('message')) {
      return String(error.get('message'));
    }
    // Otherwise serialize the Map
    const entries = Array.from(error.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    return entries || 'Unknown validation error';
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Map a MIME type to a file extension for the rendered artifact.
 *
 * Only covers the output formats the WASM engine currently produces.
 * Falls back to the caller-supplied default when the MIME type is unrecognized.
 *
 * @param {string} mimeType - MIME type from the render artifact (e.g. 'application/pdf').
 * @param {string} fallback - Extension to use when mimeType is not in the known set.
 * @returns {string} File extension without a leading dot.
 */
function extensionFromMimeType(mimeType, fallback) {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType === 'image/svg+xml') {
    return 'svg';
  }

  if (mimeType === 'text/plain') {
    return 'txt';
  }

  return fallback;
}

/**
 * Renders Quillmark content to a file artifact (PDF, SVG, etc.) via the WASM
 * engine and exposes it at a URL — either a local `file://` path or an HTTP
 * URL when served behind `McpSdkServerAdapter`'s artifact endpoint.
 *
 * Lifecycle: WASM is initialized once in the constructor. Quill definitions are
 * registered lazily on first use and version-checked on subsequent calls so the
 * engine always has the correct template loaded.
 *
 * @extends DeliveryStrategy
 */
export class RenderAndHostStrategy extends DeliveryStrategy {
  /**
   * @param {object} [options]
   * @param {string} [options.outputDir='.artifacts'] - Directory for rendered files. Created recursively if missing.
   * @param {string} [options.baseUrl='file://'] - URL prefix for artifact links. Use `'file://'` for local
   *   access or an HTTP base (e.g. `'http://localhost:8080/artifacts'`) when serving remotely.
   * @param {string} [options.format='pdf'] - Target render format passed to the WASM engine.
   */
  constructor(options = {}) {
    super();

    init();
    this.engine = new Quillmark();
    this.outputDir = options.outputDir ?? path.resolve(process.cwd(), '.artifacts');
    this.baseUrl = options.baseUrl ?? 'file://';
    this.format = options.format ?? 'pdf';
  }

  /**
   * Render validated Quillmark content and write the artifact to disk.
   *
   * Pipeline: registerQuill (if version changed) -> parseMarkdown -> render -> writeFile -> generate URL.
   *
   * Artifact naming: `<quill-name>-<uuid>.<ext>` — UUIDs prevent collisions when
   * the same quill is rendered multiple times.
   *
   * URL generation: `file://<absolute-path>` in local mode, or `<baseUrl>/<fileName>`
   * when an HTTP base URL is configured.
   *
   * This method never throws — rendering failures are caught and returned as
   * `{ status: 'error', errors: [...] }` so MCP clients always get a structured response.
   *
   * @override
   * @param {object} quill - Resolved quill object (name, version, data).
   * @param {string} validatedContent - Schema-validated Quillmark content string.
   * @returns {Promise<object>} Result object with `status` (string), optional `url` (string), and optional `errors` (array of `{ message }` objects).
   */
  async handle(quill, validatedContent) {
    try {
      logger.debug(`Rendering document (quill: ${quill.name}, bytes: ${validatedContent.length})`);

      const canonicalRef = `${quill.name}@${quill.version}`;
      const existing = this.engine.resolveQuill(canonicalRef) ?? this.engine.resolveQuill(quill.name);
      if (existing?.metadata?.version !== quill.version) {
        this.engine.registerQuill(quill.data);
      }

      const parsed = Quillmark.parseMarkdown(validatedContent);
      logger.debug(`Parsed markdown (quill: ${quill.name})`);

      const renderResult = this.engine.render(parsed, {
        format: this.format,
        quillRef: quill.name,
      });
      logger.debug(`Rendered to format (quill: ${quill.name}, format: ${this.format})`);

      const artifact = renderResult?.artifacts?.[0];
      if (!artifact || !artifact.bytes) {
        throw new Error('Render result did not include any artifacts.');
      }

      await mkdir(this.outputDir, { recursive: true });

      const extension = extensionFromMimeType(artifact.mimeType, this.format);
      const fileName = `${quill.name}-${randomUUID()}.${extension}`;
      const outputPath = path.join(this.outputDir, fileName);

      const bytes = artifact.bytes instanceof Uint8Array
        ? artifact.bytes
        : Uint8Array.from(artifact.bytes);

      await writeFile(outputPath, bytes);
      logger.debug(`Artifact written (path: ${outputPath}, bytes: ${bytes.length})`);

      let url;
      if (this.baseUrl === 'file://') {
        url = `file://${outputPath}`;
      } else {
        const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        url = `${normalizedBase}/${fileName}`;
      }

      logger.info(`Document rendered successfully (quill: ${quill.name}, url: ${url})`);
      return {
        status: 'success',
        url,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Document rendering failed (quill: ${quill.name}): ${message}`);

      return {
        status: 'error',
        errors: [{ message }],
      };
    }
  }
}

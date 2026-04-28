/**
 * @module strategies/RenderAndHostStrategy
 * Concrete delivery strategy that renders a parsed Quillmark Document via a
 * Quiver-materialised Quill handle, writes the artifact to disk, and returns
 * a reachable URL.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DeliveryStrategy } from './DeliveryStrategy.js';
import { logger } from '../logger.js';

/**
 * Extract a human-readable error message from heterogeneous error types.
 *
 * Errors from `@quillmark/wasm` come through as `Error` instances with a
 * `.diagnostics` array attached. Plain Error.message is generally enough
 * for surface-level reporting; the diagnostics array is preserved on the
 * error for callers that need it.
 *
 * @param {unknown} error - The caught value.
 * @returns {string} A string suitable for user-facing error responses.
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
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
 * @param {string} mimeType - MIME type from the render artifact (e.g. 'application/pdf').
 * @param {string} fallback - Extension to use when mimeType is not in the known set.
 * @returns {string} File extension without a leading dot.
 */
function extensionFromMimeType(mimeType, fallback) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'image/png') return 'png';
  return fallback;
}

/**
 * Renders a Quillmark `Document` to a file artifact (PDF, SVG, etc.) using a
 * Quiver-supplied `Quill` handle and exposes it at a URL — either a local
 * `file://` path or an HTTP URL when served behind `McpSdkServerAdapter`'s
 * artifact endpoint.
 *
 * @extends DeliveryStrategy
 */
export class RenderAndHostStrategy extends DeliveryStrategy {
  /**
   * @param {object} [options]
   * @param {string} [options.outputDir='.artifacts'] - Directory for rendered files. Created recursively if missing.
   * @param {string} [options.baseUrl='file://'] - URL prefix for artifact links.
   * @param {string} [options.format='pdf'] - Target render format.
   */
  constructor(options = {}) {
    super();

    this.outputDir = options.outputDir ?? path.resolve(process.cwd(), '.artifacts');
    this.baseUrl = options.baseUrl ?? 'file://';
    this.format = options.format ?? 'pdf';
  }

  /**
   * Render a parsed Document and write the resulting artifact to disk.
   *
   * Pipeline: `quill.render(doc, opts)` → write bytes → generate URL.
   *
   * Artifact naming: `<quill-name>-<uuid>.<ext>`. UUIDs prevent collisions
   * when the same quill is rendered multiple times.
   *
   * Never throws — failures are returned as `{ status: 'error', errors: [...] }`.
   *
   * @override
   * @param {object} quill - Materialised `Quill` handle from Quiver.
   * @param {object} doc - Parsed `Document` from `Document.fromMarkdown`.
   * @returns {Promise<object>} `{ status, url?, errors? }`.
   */
  async handle(quill, doc) {
    const quillName = quill?.metadata?.schema?.name ?? doc?.quillRef ?? 'document';
    try {
      logger.debug(`Rendering document (quill: ${quillName})`);

      const renderResult = quill.render(doc, { format: this.format });
      logger.debug(`Rendered to format (quill: ${quillName}, format: ${this.format})`);

      const artifact = renderResult?.artifacts?.[0];
      if (!artifact || !artifact.bytes) {
        throw new Error('Render result did not include any artifacts.');
      }

      await mkdir(this.outputDir, { recursive: true });

      const extension = extensionFromMimeType(artifact.mimeType, this.format);
      const fileName = `${quillName}-${randomUUID()}.${extension}`;
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

      logger.info(`Document rendered successfully (quill: ${quillName}, url: ${url})`);
      return { status: 'success', url };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Document rendering failed (quill: ${quillName}): ${message}`);
      return { status: 'error', errors: [{ message }] };
    }
  }
}

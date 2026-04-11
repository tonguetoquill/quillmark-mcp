import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Quillmark, init } from '@quillmark/wasm';

import { DeliveryStrategy } from './DeliveryStrategy.js';
import { logger } from '../logger.js';

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

export class RenderAndHostStrategy extends DeliveryStrategy {
  /**
   * @param {{ outputDir?: string, baseUrl?: string, format?: string }} [options]
   */
  constructor(options = {}) {
    super();

    init();
    this.engine = new Quillmark();
    this.outputDir = options.outputDir ?? path.resolve(process.cwd(), '.artifacts');
    this.baseUrl = options.baseUrl ?? 'file://';
    this.format = options.format ?? 'pdf';
  }

  async handle(quill, validatedContent) {
    try {
      logger.debug(`Rendering document (quill: ${quill.name}, bytes: ${validatedContent.length})`);

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

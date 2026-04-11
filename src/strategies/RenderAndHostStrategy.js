import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Quillmark, init } from '@quillmark/wasm';

import { DeliveryStrategy } from './DeliveryStrategy.js';
import { logger } from '../logger.js';

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
      logger.debug({ quill: quill.name, bytes: validatedContent.length }, 'Rendering document');

      const parsed = Quillmark.parseMarkdown(validatedContent);
      logger.debug({ quill: quill.name }, 'Parsed markdown');

      const renderResult = this.engine.render(parsed, {
        format: this.format,
        quillRef: quill.name,
      });
      logger.debug({ quill: quill.name, format: this.format }, 'Rendered to format');

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
      logger.debug({ path: outputPath, bytes: bytes.length }, 'Artifact written');

      let url;
      if (this.baseUrl === 'file://') {
        url = `file://${outputPath}`;
      } else {
        const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        url = `${normalizedBase}/${fileName}`;
      }

      logger.info({ quill: quill.name, url }, 'Document rendered successfully');
      return {
        status: 'success',
        url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ quill: quill.name, error: message }, 'Document rendering failed');

      return {
        status: 'error',
        errors: [{ message }],
      };
    }
  }
}

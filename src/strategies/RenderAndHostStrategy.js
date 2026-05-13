import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DeliveryStrategy } from './DeliveryStrategy.js';
import { logger } from '../logger.js';

function extensionFromMimeType(mimeType, fallback) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'image/png') return 'png';
  return fallback;
}

export class RenderAndHostStrategy extends DeliveryStrategy {
  constructor(options = {}) {
    super();

    this.outputDir = options.outputDir ?? path.resolve(process.cwd(), '.artifacts');
    this.baseUrl = options.baseUrl ?? 'file://';
    this.format = options.format ?? 'pdf';
  }

  async handle(quill, doc) {
    const quillName = quill?.metadata?.name ?? doc?.quillRef ?? 'document';

    const renderResult = quill.render(doc, { format: this.format });

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

    let url;
    if (this.baseUrl === 'file://') {
      url = `file://${outputPath}`;
    } else {
      const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
      url = `${normalizedBase}/${fileName}`;
    }

    logger.info(`Document rendered (quill: ${quillName}, url: ${url})`);
    return { url, mimeType: artifact.mimeType };
  }
}

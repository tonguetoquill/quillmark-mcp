import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Quillmark } from '@quillmark/wasm';

import { DeliveryStrategy } from './DeliveryStrategy.js';

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
   * @param {{ engine?: { render: (parsed: unknown, opts: { format: string, quillRef: string }) => { artifacts: Array<{ bytes: Uint8Array | number[], mimeType?: string }> } }, outputDir?: string, baseUrl?: string, format?: string, renderDocument?: (args: { quill: { name: string }, content: string, engine?: object, format: string }) => Promise<{ artifacts: Array<{ bytes: Uint8Array | number[], mimeType?: string }> }> | { artifacts: Array<{ bytes: Uint8Array | number[], mimeType?: string }> }, saveArtifact?: (args: { artifact: { bytes: Uint8Array | number[], mimeType?: string }, quill: { name: string }, outputDir: string, baseUrl: string, format: string }) => Promise<{ url: string }> | { url: string } }} [options]
   */
  constructor(options = {}) {
    super();

    this.engine = options.engine;
    this.outputDir = options.outputDir ?? path.resolve(process.cwd(), '.artifacts');
    this.baseUrl = options.baseUrl ?? 'file://';
    this.format = options.format ?? 'pdf';
    this.renderDocument = options.renderDocument ?? this.defaultRenderDocument.bind(this);
    this.saveArtifact = options.saveArtifact ?? this.defaultSaveArtifact.bind(this);
  }

  async handle(quill, validatedContent) {
    try {
      const renderResult = await this.renderDocument({
        quill,
        content: validatedContent,
        engine: this.engine,
        format: this.format,
      });

      const artifact = renderResult?.artifacts?.[0];
      if (!artifact || !artifact.bytes) {
        throw new Error('Render result did not include any artifacts.');
      }

      const saveResult = await this.saveArtifact({
        artifact,
        quill,
        outputDir: this.outputDir,
        baseUrl: this.baseUrl,
        format: this.format,
      });

      return {
        status: 'success',
        url: saveResult.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        status: 'error',
        errors: [{ message }],
      };
    }
  }

  defaultRenderDocument({ quill, content, engine, format }) {
    if (!engine || typeof engine.render !== 'function') {
      throw new Error('RenderAndHostStrategy requires an engine with a render() method.');
    }

    const parsed = Quillmark.parseMarkdown(content);
    return engine.render(parsed, {
      format,
      quillRef: quill.name,
    });
  }

  async defaultSaveArtifact({ artifact, quill, outputDir, baseUrl, format }) {
    await mkdir(outputDir, { recursive: true });

    const extension = extensionFromMimeType(artifact.mimeType, format);
    const fileName = `${quill.name}-${randomUUID()}.${extension}`;
    const outputPath = path.join(outputDir, fileName);

    const bytes = artifact.bytes instanceof Uint8Array
      ? artifact.bytes
      : Uint8Array.from(artifact.bytes);

    await writeFile(outputPath, bytes);

    if (baseUrl === 'file://') {
      return { url: `file://${outputPath}` };
    }

    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return { url: `${normalizedBase}/${fileName}` };
  }
}

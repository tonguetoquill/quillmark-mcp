/**
 * @module strategies/RenderAndHostDeliverer
 * Factory that builds a `Deliverer` (the @quillmark/mcp contract) which renders
 * a document, writes the artifact bytes to disk, and returns a reachable URL.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../logger.js';
import { getErrorMessage } from '../errors.js';

function extensionFromMimeType(mimeType, fallback) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'image/png') return 'png';
  return fallback;
}

export function createRenderAndHostDeliverer({
  outputDir = path.resolve(process.cwd(), '.artifacts'),
  baseUrl = 'file://',
  format = 'pdf',
} = {}) {
  return async ({ render, canonicalRef, metadata }) => {
    const quillName = metadata?.schema?.name ?? canonicalRef ?? 'document';
    try {
      const artifacts = render({ format });
      const artifact = artifacts?.[0];
      if (!artifact || !artifact.bytes) {
        throw new Error('Render result did not include any artifacts.');
      }

      await mkdir(outputDir, { recursive: true });

      const extension = extensionFromMimeType(artifact.mimeType, format);
      const fileName = `${quillName}-${randomUUID()}.${extension}`;
      const outputPath = path.join(outputDir, fileName);

      const bytes = artifact.bytes instanceof Uint8Array
        ? artifact.bytes
        : Uint8Array.from(artifact.bytes);

      await writeFile(outputPath, bytes);

      const url = baseUrl === 'file://'
        ? `file://${outputPath}`
        : `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${fileName}`;

      logger.info(`Document rendered (quill: ${quillName}, url: ${url})`);
      return { status: 'success', url };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Document rendering failed (quill: ${quillName}): ${message}`);
      return { status: 'error', errors: [{ message }] };
    }
  };
}

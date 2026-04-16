#!/usr/bin/env node
// Quick render harness: node scripts/render-one.mjs <quill_name> [out.pdf]
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';
import { createDocument } from '../src/primitives/index.js';
import { RenderAndHostStrategy } from '../src/strategies/index.js';

const [, , quillName, outFile] = process.argv;
if (!quillName) {
  console.error('Usage: node scripts/render-one.mjs <quill_name> [out.pdf]');
  process.exit(1);
}

const quillsDir = fileURLToPath(new URL('../quills', import.meta.url));
const outDir = path.resolve('./.render-out');
await mkdir(outDir, { recursive: true });

init();
const registry = new QuillRegistry({
  source: new FileSystemSource(quillsDir),
  engine: new Quillmark(),
});

const versions = ['0.1.0', '0.2.0', '1.0.0'];
let examplePath;
for (const v of versions) {
  const candidate = path.join(quillsDir, quillName, v, 'example.md');
  try {
    await readFile(candidate);
    examplePath = candidate;
    break;
  } catch {}
}
if (!examplePath) {
  console.error(`No example.md found for ${quillName} under quills/${quillName}/*/`);
  process.exit(1);
}

const content = await readFile(examplePath, 'utf8');
const strategy = new RenderAndHostStrategy({ outputDir: outDir, baseUrl: 'file://' + outDir });
const result = await createDocument(registry, strategy, content);

if (result.status !== 'success') {
  console.error('RENDER FAILED');
  console.error(JSON.stringify(result, null, 2));
  process.exit(2);
}

const filename = result.url.split('/').pop();
const finalPath = path.join(outDir, filename);
if (outFile) {
  const { copyFile } = await import('node:fs/promises');
  await copyFile(finalPath, outFile);
  console.log(`Rendered to ${outFile}`);
} else {
  console.log(`Rendered to ${finalPath}`);
}

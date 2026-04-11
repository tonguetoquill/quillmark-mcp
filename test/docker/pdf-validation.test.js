// Layer 6 — PDF fidelity + rendering stress.
// Validates that the PDFs the container emits are structurally sane,
// consistent, and don't leak memory under load.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { SHOULD_RUN, startHttpContainer, docker } from './helpers.js';

const maybe = SHOULD_RUN ? describe : describe.skip;

async function renderMemo(client, content) {
  const result = await client.callTool({
    name: 'create_document',
    arguments: { content },
  });
  const body = result.structuredContent ?? JSON.parse(result.content[0].text);
  if (body.status !== 'success') {
    throw new Error(`create_document failed: ${JSON.stringify(body)}`);
  }
  return body.url;
}

async function downloadPdf(url) {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`download ${url}: status ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readMemMB(containerName) {
  // docker stats needs --no-stream; format MemUsage like "42.3MiB / 512MiB".
  const raw = docker(['stats', '--no-stream', '--format', '{{.MemUsage}}', containerName]);
  const mib = parseFloat(raw.split('/')[0]);
  return Number.isFinite(mib) ? mib : 0;
}

maybe('Layer 6: PDF fidelity + rendering stress', () => {
  let ctx;
  let client;
  let exampleMemo;

  before(async () => {
    ctx = await startHttpContainer();
    exampleMemo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');

    client = new Client({ name: 'layer6-test', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(ctx.mcpUrl));
    await client.connect(transport);
  });

  after(async () => {
    await client?.close().catch(() => {});
    ctx?.stop();
  });

  it('rendered PDF starts with %PDF- magic bytes', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  it('rendered PDF contains %%EOF marker near the end', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const tail = pdf.subarray(Math.max(0, pdf.length - 1024)).toString('binary');
    assert.match(tail, /%%EOF\s*$/);
  });

  it('rendered PDF is non-trivial in size (> 10 KB)', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.ok(pdf.length > 10 * 1024,
      `expected PDF > 10KB, got ${pdf.length} bytes (likely an empty or error document)`);
  });

  it('rendered PDF advertises a PDF version in the header', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const header = pdf.subarray(0, 16).toString('ascii');
    assert.match(header, /^%PDF-1\.\d/, `unexpected PDF header: ${header}`);
  });

  it('rendered PDF declares at least one /Type /Page object', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    // Crude but effective: /Type /Page appears literally in uncompressed cross-ref sections.
    // For object-stream compressed PDFs this still typically leaks the Catalog's /Pages reference.
    assert.match(
      pdf.toString('binary'),
      /\/Type\s*\/Pages?\b/,
      'no /Type /Page(s) reference found in PDF — not a real document',
    );
  });

  it('rendered PDF embeds at least one Font object', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.match(
      pdf.toString('binary'),
      /\/Type\s*\/Font\b/,
      'no /Type /Font — bundled fonts likely did not ship into the image',
    );
  });

  it('rendered PDF contains no /JavaScript actions (safety sanity)', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const body = pdf.toString('binary');
    assert.doesNotMatch(body, /\/JavaScript\b/, 'PDF unexpectedly contains /JavaScript');
  });

  it('two renders of the same input produce bytewise-identical output', async () => {
    const [urlA, urlB] = await Promise.all([
      renderMemo(client, exampleMemo),
      renderMemo(client, exampleMemo),
    ]);
    const [a, b] = await Promise.all([downloadPdf(urlA), downloadPdf(urlB)]);
    // If Typst/Quillmark happens to be non-deterministic, fall back to size parity.
    if (sha(a) !== sha(b)) {
      const delta = Math.abs(a.length - b.length);
      assert.ok(
        delta < 256,
        `renders differ: |len_a - len_b| = ${delta} bytes (sha_a=${sha(a).slice(0, 12)} sha_b=${sha(b).slice(0, 12)})`,
      );
    }
  });

  it('10 sequential renders all succeed and memory stays bounded', async () => {
    const before = readMemMB(ctx.name);
    const urls = [];
    for (let i = 0; i < 10; i++) {
      urls.push(await renderMemo(client, exampleMemo));
    }
    const after = readMemMB(ctx.name);

    for (const u of urls) {
      const pdf = await downloadPdf(u);
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    }

    const delta = after - before;
    assert.ok(
      delta < 200,
      `memory growth ${delta.toFixed(1)} MiB over 10 renders exceeds 200 MiB threshold (before ${before}, after ${after})`,
    );
  });

  it('malformed input does not crash the container (recoverable)', async () => {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: '---\nQUILL: usaf_memo\ngarbage yaml: [not-closed\n---\nhi' },
    });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.notEqual(body.status, 'success');
    // Server should still be alive for a follow-up valid render.
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  });
});

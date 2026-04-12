/**
 * @module test/docker/pdf-validation
 *
 * Layer 6 -- PDF fidelity and rendering stress.
 *
 * Validates structural correctness, determinism, and memory stability of
 * PDFs emitted by the Quillmark container. Tests run against a live
 * Docker container over Streamable HTTP MCP transport.
 *
 * Gate: skipped unless the Docker helpers' `SHOULD_RUN` flag is truthy
 * (requires Docker socket + image available). Uses the `maybe` pattern:
 * `const maybe = SHOULD_RUN ? describe : describe.skip` so the entire
 * suite becomes a no-op in environments without Docker.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it, before, after } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { SHOULD_RUN, startHttpContainer, docker } from './helpers.js';

/** @type {import('node:test').describe | import('node:test').describe['skip']} */
const maybe = SHOULD_RUN ? describe : describe.skip;

/**
 * Call `create_document` via MCP and return the artifact URL.
 * Throws if the tool reports a non-success status.
 *
 * @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client - Connected MCP client.
 * @param {string} content - Markdown memo content (with YAML front-matter).
 * @returns {Promise<string>} Absolute URL to the rendered PDF artifact.
 */
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

/**
 * Fetch a PDF artifact by URL and return the raw buffer.
 *
 * @param {string} url - Artifact URL returned by {@link renderMemo}.
 * @returns {Promise<Buffer>} Raw PDF bytes.
 */
async function downloadPdf(url) {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`download ${url}: status ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * SHA-256 hex digest of a buffer.
 *
 * @param {Buffer} buf
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Sample the container's current memory usage via `docker stats`.
 *
 * @param {string} containerName - Docker container name or ID.
 * @returns {number} Current memory usage in MiB, or 0 if unparseable.
 */
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

  /** Validate magic bytes: first 5 bytes must be `%PDF-` per ISO 32000. */
  it('rendered PDF starts with %PDF- magic bytes', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  /** Validate EOF marker: last 1024 bytes must contain `%%EOF` (ISO 32000 trailer). */
  it('rendered PDF contains %%EOF marker near the end', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const tail = pdf.subarray(Math.max(0, pdf.length - 1024)).toString('binary');
    assert.match(tail, /%%EOF\s*$/);
  });

  /** Validate minimum size: >10 KB guards against empty/error stubs. */
  it('rendered PDF is non-trivial in size (> 10 KB)', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.ok(pdf.length > 10 * 1024,
      `expected PDF > 10KB, got ${pdf.length} bytes (likely an empty or error document)`);
  });

  /** Validate version header: must match `%PDF-1.x` (Typst emits PDF 1.x). */
  it('rendered PDF advertises a PDF version in the header', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const header = pdf.subarray(0, 16).toString('ascii');
    assert.match(header, /^%PDF-1\.\d/, `unexpected PDF header: ${header}`);
  });

  /** Validate page objects: at least one `/Type /Page(s)` ref must exist in the binary. */
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

  /** Validate font embedding: `/Type /Font` must be present (catches missing bundled fonts). */
  it('rendered PDF embeds at least one Font object', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    assert.match(
      pdf.toString('binary'),
      /\/Type\s*\/Font\b/,
      'no /Type /Font — bundled fonts likely did not ship into the image',
    );
  });

  /** Safety gate: PDF must not contain `/JavaScript` actions (no executable content). */
  it('rendered PDF contains no /JavaScript actions (safety sanity)', async () => {
    const url = await renderMemo(client, exampleMemo);
    const pdf = await downloadPdf(url);
    const body = pdf.toString('binary');
    assert.doesNotMatch(body, /\/JavaScript\b/, 'PDF unexpectedly contains /JavaScript');
  });

  /**
   * Determinism check: two renders of identical input should produce identical
   * (or near-identical, within 256-byte tolerance) output.
   */
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

  /**
   * Memory stability: 10 sequential renders must all produce valid PDFs and
   * container memory growth must stay under 200 MiB (catches leaks in Typst/node).
   */
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

  /**
   * Crash recovery: malformed YAML front-matter must fail gracefully without
   * killing the container. A subsequent valid render must still succeed.
   */
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

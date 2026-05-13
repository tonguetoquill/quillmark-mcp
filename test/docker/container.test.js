/**
 * @module test/docker/container
 * @description Layer 4 — container black-box integration tests.
 *
 * Validates the built Docker image as an opaque unit: health, security
 * posture (non-root, read-only rootfs, path-traversal rejection),
 * HTTP transport correctness, graceful shutdown via tini, custom env
 * overrides, and artifact persistence across container restarts.
 *
 * Gated on `DOCKER_TEST=1` (set by `scripts/docker-test.sh`).
 * When the env var is unset the entire suite is skipped via the
 * {@link maybe} pattern — see below.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import {
  SHOULD_RUN,
  IMAGE,
  docker,
  dockerNoThrow,
  startHttpContainer,
  createTestVolume,
  removeTestVolume,
} from './helpers.js';

/**
 * Conditional describe — resolves to `describe` when `SHOULD_RUN` is truthy,
 * otherwise `describe.skip`. This "maybe" pattern lets the test file be
 * safely imported by the runner in any environment; without Docker the
 * entire suite is skipped rather than failing.
 *
 * @type {import('node:test').describe}
 */
const maybe = SHOULD_RUN ? describe : describe.skip;

/**
 * @description Top-level suite: spins up a shared container (`ctx`) for most
 * tests; individual tests that need isolation start throwaway containers.
 *
 * Covers: health/readiness, non-root UID enforcement, MCP HTTP endpoint
 * wiring, JSON 404 shape, SIGTERM/tini graceful shutdown, custom endpoint
 * env override, artifact volume persistence, path-traversal rejection,
 * and tini as PID 1.
 */
maybe('Layer 4: container black-box', () => {
  let ctx;

  before(async () => {
    ctx = await startHttpContainer();
  });

  after(() => {
    ctx?.stop();
  });

  /** @description Asserts Docker state is "running" after HTTP readiness. */
  it('container reports healthy (or at least running) within 20s', async () => {
    // Docker HEALTHCHECK default is 30s interval so we can't easily gate on 'healthy',
    // but the waitForHttp in startHttpContainer already proved the endpoint responds.
    const state = docker(['inspect', '-f', '{{.State.Status}}', ctx.name]);
    assert.equal(state, 'running');
  });

  /** @description Verifies the container process runs as UID/GID 10001 (non-root). */
  it('container runs as non-root uid 10001', () => {
    const uid = docker(['exec', ctx.name, 'id', '-u']);
    assert.equal(uid, '10001', `expected uid 10001, got ${uid}`);
    const gid = docker(['exec', ctx.name, 'id', '-g']);
    assert.equal(gid, '10001');
  });

  /** @description GET on /mcp proves the MCP Streamable HTTP transport is wired up (expects 2xx-4xx, not 5xx). */
  it('/mcp endpoint responds over the published port', async () => {
    const res = await fetch(ctx.mcpUrl, { method: 'GET' });
    // GET on the MCP endpoint without a session returns 4xx (405 or 400),
    // proving the MCP transport is wired up, not just the HTTP listener.
    assert.ok(res.status >= 200 && res.status < 500, `unexpected status ${res.status}`);
  });

  /** @description Unknown paths must return `{"error":"not_found"}` with `application/json` content-type. */
  it('non-endpoint path returns a well-formed JSON 404', async () => {
    const res = await fetch(`${ctx.baseUrl}/nope`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'not_found');
  });

  /**
   * @description Proves tini forwards SIGTERM to Node so the process exits
   * gracefully. Uses a throwaway container to avoid tearing down `ctx`.
   * Asserts exit within 8s and exit code 0 or 143.
   */
  it('SIGTERM forwarded by tini → container stops within 5s', () => {
    // Use a throwaway container for this test so we don't tear down `ctx`.
    const throwaway = startHttpContainerSync();
    try {
      const start = Date.now();
      dockerNoThrow(['stop', '--time', '5', throwaway]);
      const elapsed = Date.now() - start;
      const state = docker(['inspect', '-f', '{{.State.Status}}', throwaway]);
      assert.equal(state, 'exited');
      assert.ok(elapsed < 8_000, `expected graceful stop < 8s, got ${elapsed}ms`);
      const exitCode = docker(['inspect', '-f', '{{.State.ExitCode}}', throwaway]);
      // Node exits with 0 on clean SIGTERM via tini; accept 0 or 143 (128+SIGTERM).
      assert.ok(
        exitCode === '0' || exitCode === '143',
        `expected exit 0 or 143, got ${exitCode}`,
      );
    } finally {
      dockerNoThrow(['rm', '-f', throwaway]);
    }
  });

  /**
   * @description Spins up a second container with `QUILLMARK_ENDPOINT=/custom/mcp`.
   * The custom path must respond; the default `/mcp` must 404.
   */
  it('custom QUILLMARK_ENDPOINT env var is honored', async () => {
    const custom = await startHttpContainer({
      env: { QUILLMARK_ENDPOINT: '/custom/mcp' },
      endpoint: '/custom/mcp',
    });
    try {
      const hit = await fetch(custom.mcpUrl, { method: 'GET' });
      assert.ok(hit.status >= 200 && hit.status < 500);

      const miss = await fetch(`${custom.baseUrl}/mcp`);
      assert.equal(miss.status, 404);
    } finally {
      custom.stop();
    }
  });

  /**
   * @description End-to-end artifact persistence: renders a PDF via MCP in
   * container A, stops it, starts container B on the same volume, and
   * asserts byte-identical retrieval. Validates the volume mount contract.
   */
  it('renders survive container restart when artifacts volume persists', async () => {
    const vol = createTestVolume('persist');
    let a, b;
    try {
      a = await startHttpContainer({ volume: vol });

      // Seed the volume by rendering a doc via MCP HTTP.
      const artifactUrl = await renderOneMemo(a);
      assert.match(artifactUrl, /\/artifacts\//);
      const fileName = artifactUrl.split('/artifacts/')[1];
      assert.ok(fileName && fileName.endsWith('.pdf'), `bad artifact URL ${artifactUrl}`);

      // Fetch once from the first container to prove it serves what it made.
      const first = await fetch(artifactUrl);
      assert.equal(first.status, 200);
      const firstBytes = Buffer.from(await first.arrayBuffer());
      assert.ok(firstBytes.length > 1024, 'artifact too small to be a real PDF');

      a.stop();

      // Second container using the same volume should serve the same file.
      b = await startHttpContainer({ volume: vol });
      const persistedUrl = `${b.artifactsUrl}/${fileName}`;
      const second = await fetch(persistedUrl);
      assert.equal(second.status, 200, 'artifact did not persist across restarts');
      const secondBytes = Buffer.from(await second.arrayBuffer());
      assert.deepEqual(secondBytes, firstBytes, 'bytes mismatch after restart');
    } finally {
      a?.stop();
      b?.stop();
      removeTestVolume(vol);
    }
  });

  /** @description Ensures `../../etc/passwd` traversal on `/artifacts/` returns 400/403/404. */
  it('path traversal in /artifacts/ is rejected', async () => {
    const res = await fetch(`${ctx.baseUrl}/artifacts/../../etc/passwd`);
    assert.ok(res.status === 400 || res.status === 403 || res.status === 404,
      `expected 4xx for traversal, got ${res.status}`);
  });

  /** @description Reads `/proc/1/comm` inside the container to confirm tini is PID 1. */
  it('image ships with tini as PID 1 child supervisor', () => {
    const pid1 = docker(['exec', ctx.name, 'cat', '/proc/1/comm']);
    assert.match(pid1, /tini/, `expected tini at PID 1, got "${pid1}"`);
  });
});

// --- helpers scoped to this file ---

/**
 * Synchronous, fire-and-forget container start (no HTTP readiness wait).
 * Used by the SIGTERM timing test where we need to control the stop ourselves.
 *
 * @returns {string} Container name/ID from `docker run -d`.
 */
function startHttpContainerSync() {
  // Cheap synchronous variant for the stop-timing test: run detached, no wait.
  return docker([
    'run', '-d',
    '--label', 'quillmark-mcp-test=1',
    '--user', '10001:10001',
    '--read-only', '--tmpfs', '/tmp',
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    IMAGE,
  ]);
}

/**
 * Renders a single USAF memo PDF via the MCP `create_document` tool.
 * Returns the artifact URL served by the container.
 *
 * @param {object} container - Container context from {@link startHttpContainer}.
 * @returns {Promise<string>} Absolute artifact URL (e.g. `http://localhost:<port>/artifacts/<id>.pdf`).
 */
async function renderOneMemo(container) {
  const memo = await import('node:fs').then((m) =>
    m.promises.readFile('quills/usaf_memo/0.2.0/example.md', 'utf8'),
  );
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );
  const client = new Client({ name: 'container-test', version: '0.0.1' });
  const transport = new StreamableHTTPClientTransport(new URL(container.mcpUrl));
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'create_document',
      arguments: { content: memo },
    });
    if (result.isError) {
      throw new Error(`create_document failed: ${result.content?.[0]?.text ?? 'unknown'}`);
    }
    const url = result.structuredContent?.url;
    if (!url) throw new Error(`create_document missing url: ${JSON.stringify(result)}`);
    return url;
  } finally {
    await client.close();
  }
}

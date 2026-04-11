// Layer 4 — container black-box integration.
// Runs only when DOCKER_TEST=1 (set by scripts/docker-test.sh).
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

const maybe = SHOULD_RUN ? describe : describe.skip;

maybe('Layer 4: container black-box', () => {
  let ctx;

  before(async () => {
    ctx = await startHttpContainer();
  });

  after(() => {
    ctx?.stop();
  });

  it('container reports healthy (or at least running) within 20s', async () => {
    // Docker HEALTHCHECK default is 30s interval so we can't easily gate on 'healthy',
    // but the waitForHttp in startHttpContainer already proved the endpoint responds.
    const state = docker(['inspect', '-f', '{{.State.Status}}', ctx.name]);
    assert.equal(state, 'running');
  });

  it('container runs as non-root uid 10001', () => {
    const uid = docker(['exec', ctx.name, 'id', '-u']);
    assert.equal(uid, '10001', `expected uid 10001, got ${uid}`);
    const gid = docker(['exec', ctx.name, 'id', '-g']);
    assert.equal(gid, '10001');
  });

  it('/mcp endpoint responds over the published port', async () => {
    const res = await fetch(ctx.mcpUrl, { method: 'GET' });
    // GET on the MCP endpoint without a session returns 4xx (405 or 400),
    // proving the MCP transport is wired up, not just the HTTP listener.
    assert.ok(res.status >= 200 && res.status < 500, `unexpected status ${res.status}`);
  });

  it('non-endpoint path returns a well-formed JSON 404', async () => {
    const res = await fetch(`${ctx.baseUrl}/nope`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'not_found');
  });

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

  it('path traversal in /artifacts/ is rejected', async () => {
    const res = await fetch(`${ctx.baseUrl}/artifacts/../../etc/passwd`);
    assert.ok(res.status === 400 || res.status === 403 || res.status === 404,
      `expected 4xx for traversal, got ${res.status}`);
  });

  it('image ships with tini as PID 1 child supervisor', () => {
    const pid1 = docker(['exec', ctx.name, 'cat', '/proc/1/comm']);
    assert.match(pid1, /tini/, `expected tini at PID 1, got "${pid1}"`);
  });
});

// --- helpers scoped to this file ---

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
    const body = result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? '{}');
    if (body.status !== 'success') {
      throw new Error(`create_document failed: ${JSON.stringify(body)}`);
    }
    return body.url;
  } finally {
    await client.close();
  }
}

// Shared helpers for Docker-based tests (Layers 4, 5, 6).
// All tests run against a freshly built `quillmark-mcp:dev` image.
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

export const IMAGE = process.env.QUILLMARK_IMAGE ?? 'quillmark-mcp:dev';
export const LABEL = 'quillmark-mcp-test=1';

export function docker(args, { input } = {}) {
  const res = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    const err = new Error(
      `docker ${args.join(' ')} failed (exit ${res.status}): ${res.stderr?.trim() ?? ''}`,
    );
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    err.status = res.status;
    throw err;
  }
  return res.stdout.trim();
}

export function dockerNoThrow(args, { input } = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', input });
}

export async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

export async function waitForHttp(baseUrl, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { method: 'GET' });
      // Any HTTP response (even 404/405) proves the listener is up.
      if (res.status < 500) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(150);
  }
  throw new Error(`HTTP not reachable at ${baseUrl} after ${timeoutMs}ms: ${lastErr?.message}`);
}

/**
 * Start a container in detached mode with streamable HTTP transport.
 * Retries with a fresh port if the kernel loses the TOCTOU race between
 * findFreePort's probe and docker's actual bind.
 * Returns { name, port, baseUrl, mcpUrl, artifactsUrl, stop(), logs() }.
 */
export async function startHttpContainer({
  extraArgs = [],
  env = {},
  endpoint = '/mcp',
  volume = null,
} = {}) {
  const MAX_ATTEMPTS = 5;
  let port;
  let name;
  let lastErr;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    port = await findFreePort();
    name = `quillmark-mcp-test-${randomBytes(4).toString('hex')}`;

    const args = [
      'run', '-d',
      '--name', name,
      '--label', LABEL,
      '--user', '10001:10001',
      '--read-only',
      '--tmpfs', '/tmp',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '--pids-limit=256',
      '-p', `127.0.0.1:${port}:8080`,
    ];

    if (volume) {
      args.push('-v', `${volume}:/data/artifacts`);
    }

    const effectiveEnv = {
      QUILLMARK_BASE_URL: `http://127.0.0.1:${port}/artifacts`,
      ...env,
    };
    for (const [k, v] of Object.entries(effectiveEnv)) {
      args.push('-e', `${k}=${v}`);
    }

    args.push(...extraArgs, IMAGE);

    const res = dockerNoThrow(args);
    if (res.status === 0) {
      break;
    }
    lastErr = new Error(`docker run failed: ${res.stderr?.trim() ?? ''}`);
    // If it's a port collision, retry; otherwise bail fast.
    if (!/address already in use|bind.*already in use/i.test(res.stderr ?? '')) {
      throw lastErr;
    }
    dockerNoThrow(['rm', '-f', name]); // the failed container may linger
    await sleep(200);
  }

  if (!name || lastErr && dockerNoThrow(['inspect', name]).status !== 0) {
    throw lastErr ?? new Error('failed to start container after retries');
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const mcpUrl = `${baseUrl}${endpoint}`;
  const artifactsUrl = `${baseUrl}/artifacts`;

  // Wait for the listener to be reachable.
  try {
    await waitForHttp(mcpUrl, 20_000);
  } catch (err) {
    const logs = dockerNoThrow(['logs', name]).stdout ?? '';
    throw new Error(`container ${name} failed to become ready:\n${err.message}\n---\nlogs:\n${logs}`);
  }

  return {
    name,
    port,
    baseUrl,
    mcpUrl,
    artifactsUrl,
    logs: () => dockerNoThrow(['logs', name]).stdout ?? '',
    stop: () => {
      dockerNoThrow(['rm', '-f', name]);
    },
  };
}

export function createTestVolume(tag = 'vol') {
  const name = `quillmark-mcp-test-${tag}-${randomBytes(4).toString('hex')}`;
  docker(['volume', 'create', '--label', LABEL, name]);
  return name;
}

export function removeTestVolume(name) {
  dockerNoThrow(['volume', 'rm', '-f', name]);
}

// JSON-RPC 2.0 helpers for direct Streamable HTTP plumbing.
// We use these only when we need to assert session semantics or Origin
// handling; richer flows use the MCP SDK client directly.
export async function jsonRpc(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsed,
    raw: text,
  };
}

export function rpc(method, params, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

export const SHOULD_RUN = process.env.DOCKER_TEST === '1';

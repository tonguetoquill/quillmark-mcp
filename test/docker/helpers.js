/**
 * @module test/docker/helpers
 * Shared infrastructure for Docker-based integration tests (Layers 4, 5, 6).
 * Provides container lifecycle, port allocation, HTTP polling, JSON-RPC
 * plumbing, and volume management against a freshly built Docker image.
 */
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Docker image used for all container tests.
 * Override via `QUILLMARK_IMAGE` env var; defaults to `quillmark-mcp:dev`.
 * @type {string}
 */
export const IMAGE = process.env.QUILLMARK_IMAGE ?? 'quillmark-mcp:dev';

/**
 * Label applied to all test containers and volumes for easy cleanup.
 * @type {string}
 */
export const LABEL = 'quillmark-mcp-test=1';

/**
 * Run a `docker` CLI command synchronously. Throws on non-zero exit.
 * @param {string[]} args - Arguments passed to `docker` (e.g. `['run', '-d', IMAGE]`).
 * @param {Object} [opts] - Options.
 * @param {string} [opts.input] - Data piped to stdin.
 * @returns {string} Trimmed stdout from the command.
 * @throws {Error} If docker exits non-zero. The error has `.stdout`, `.stderr`, and `.status` properties.
 */
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

/**
 * Run a `docker` CLI command synchronously. Never throws on failure.
 * @param {string[]} args - Arguments passed to `docker`.
 * @param {Object} [opts] - Options.
 * @param {string} [opts.input] - Data piped to stdin.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} Raw spawnSync result.
 */
export function dockerNoThrow(args, { input } = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', input });
}

/**
 * Ask the kernel for an ephemeral port by binding to port 0, then immediately
 * closing. Subject to TOCTOU races — callers should retry on bind failure.
 * @returns {Promise<number>} A free TCP port on 127.0.0.1.
 */
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

/**
 * Poll an HTTP endpoint until it responds with a non-5xx status.
 * Any response (including 404/405) is considered "up".
 * @param {string} baseUrl - URL to GET.
 * @param {number} [timeoutMs=15000] - Max wait in milliseconds.
 * @returns {Promise<void>} Resolves when the endpoint is reachable.
 * @throws {Error} If the endpoint is not reachable within the timeout.
 */
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
 * Start a hardened container in detached mode with Streamable HTTP transport.
 * Applies security flags: `--read-only`, `--cap-drop=ALL`, `--no-new-privileges`,
 * `--pids-limit=256`, and runs as non-root (UID 10001).
 *
 * Retries with a fresh port (up to 5 attempts) if the kernel loses the
 * TOCTOU race between `findFreePort` and Docker's actual bind.
 *
 * @param {Object} [opts] - Container options.
 * @param {string[]} [opts.extraArgs=[]] - Additional `docker run` arguments.
 * @param {Record<string, string>} [opts.env={}] - Extra environment variables injected via `-e`.
 * @param {string} [opts.endpoint='/mcp'] - HTTP path for the MCP endpoint.
 * @param {string|null} [opts.volume=null] - Named volume to mount at `/data/artifacts`.
 * @returns {Promise<{
 *   name: string,
 *   port: number,
 *   baseUrl: string,
 *   mcpUrl: string,
 *   artifactsUrl: string,
 *   logs: () => string,
 *   stop: () => void
 * }>} Container context object. Call `stop()` to remove the container;
 *   `logs()` returns current container stdout.
 * @throws {Error} If the container fails to start or become HTTP-ready.
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

/**
 * Create a labeled Docker volume for test isolation.
 * @param {string} [tag='vol'] - Short tag embedded in the volume name.
 * @returns {string} The created volume name.
 * @throws {Error} If `docker volume create` fails.
 */
export function createTestVolume(tag = 'vol') {
  const name = `quillmark-mcp-test-${tag}-${randomBytes(4).toString('hex')}`;
  docker(['volume', 'create', '--label', LABEL, name]);
  return name;
}

/**
 * Force-remove a Docker volume. Never throws (uses `-f`).
 * @param {string} name - Volume name to remove.
 * @returns {void}
 */
export function removeTestVolume(name) {
  dockerNoThrow(['volume', 'rm', '-f', name]);
}

/**
 * Send a JSON-RPC 2.0 POST request and parse the response.
 * Accepts both `application/json` and `text/event-stream` responses;
 * falls back to raw text if JSON parsing fails (e.g. SSE frames).
 *
 * Used for low-level assertions on session semantics and Origin handling;
 * higher-level flows should use the MCP SDK client instead.
 *
 * @param {string} url - Target URL (typically the MCP endpoint).
 * @param {Object} body - JSON-RPC request payload (will be `JSON.stringify`'d).
 * @param {Record<string, string>} [headers={}] - Extra request headers merged over defaults.
 * @returns {Promise<{
 *   status: number,
 *   headers: Record<string, string>,
 *   body: Object|string|null,
 *   raw: string
 * }>} Parsed response. `.body` is the JSON-parsed response or raw text on parse failure.
 */
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

/**
 * Build a JSON-RPC 2.0 request envelope.
 * @param {string} method - RPC method name (e.g. `'initialize'`, `'tools/list'`).
 * @param {Object} [params] - Method parameters.
 * @param {number} [id=1] - Request ID.
 * @returns {{ jsonrpc: '2.0', id: number, method: string, params?: Object }} JSON-RPC request object.
 */
export function rpc(method, params, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

/**
 * Gate flag for Docker-dependent test suites. Set `DOCKER_TEST=1` to enable.
 * @type {boolean}
 */
export const SHOULD_RUN = process.env.DOCKER_TEST === '1';

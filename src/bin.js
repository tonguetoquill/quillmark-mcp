#!/usr/bin/env node
/**
 * @module bin
 * CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { generateConfig, isSupported, SUPPORTED_CLIENTS } from './cli/config.js';
import { createDefaultMCP } from './mcp/index.js';
import { getErrorMessage } from './errors.js';
import { RenderAndHostStrategy } from './strategies/index.js';

/**
 * Converts a Quiver directory path to an absolute path.
 * Relative paths are resolved against `cwd`; absolute paths pass through unchanged.
 *
 * @param {string} quiverDir - Raw Quiver directory path (relative or absolute).
 * @param {string} [cwd=process.cwd()] - Working directory for resolving relative paths.
 * @returns {string} Absolute path to the Quiver root directory.
 */
export function resolveQuiverDir(quiverDir, cwd = process.cwd()) {
  return path.isAbsolute(quiverDir) ? quiverDir : path.resolve(cwd, quiverDir);
}

/**
 * Parses a "{host}:{port}" bind string into its components.
 * Uses the last colon as delimiter so IPv6 addresses (e.g. `[::1]:8080`) work correctly.
 *
 * @param {string} bind - Bind address in "host:port" format.
 * @returns {{ host: string, port: number }} Parsed host and numeric port.
 * @throws {Error} If the string lacks a colon, host is empty, or port is NaN.
 *
 * @example
 * parseBind('localhost:3000');  // { host: 'localhost', port: 3000 }
 * parseBind('[::1]:8080');      // { host: '[::1]', port: 8080 }
 */
export function parseBind(bind) {
  const lastColon = bind.lastIndexOf(':');
  if (lastColon === -1) throw new Error(`Invalid --bind value "${bind}": expected {host}:{port}`);
  const host = bind.slice(0, lastColon);
  const port = parseInt(bind.slice(lastColon + 1), 10);
  if (!host || Number.isNaN(port)) throw new Error(`Invalid --bind value "${bind}": expected {host}:{port}`);
  return { host, port };
}

/**
 * Selects the first defined, non-empty value using CLI > env > fallback precedence.
 *
 * @param {*} cliValue - Value from parsed CLI flag (wins if not `undefined`).
 * @param {*} envValue - Value from environment variable (wins if defined and non-empty).
 * @param {*} fallback - Default value when neither source provides one.
 * @returns {*} The resolved value.
 */
function pick(cliValue, envValue, fallback) {
  if (cliValue !== undefined) return cliValue;
  if (envValue !== undefined && envValue !== '') return envValue;
  return fallback;
}

/**
 * Main CLI entry point. Two paths:
 *
 * 1. `config <client>` — print a Claude Code / Codex config snippet (no side effects).
 * 2. Server start (default) — resolve the Quiver dir, build a `RenderAndHostStrategy`,
 *    and start the MCP server over stdio or streamable HTTP.
 *
 * Settings resolve as CLI flag > env var > default (see `pick`). The env fallbacks
 * are the `QUILLMARK_*` vars documented in README's env-var table.
 *
 * `deps` injects every side-effectful dependency so `bin.test.js` can drive `main`
 * in-process without spawning a subprocess or touching the real filesystem.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI arguments (without node/script).
 * @param {object} [deps={}] - Injectable dependencies for testing.
 * @returns {Promise<void>}
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const {
    cwd = process.cwd(),
    exists = existsSync,
    consoleLog = console.log,
    consoleError = console.error,
    setExitCode = (code) => {
      process.exitCode = code;
    },
    StrategyClass = RenderAndHostStrategy,
    createMCP = createDefaultMCP,
    env = process.env,
  } = deps;

  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'quiver-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      'base-url': { type: 'string' },
      'bind': { type: 'string' },
      'endpoint': { type: 'string' },
      'stdio': { type: 'boolean', default: false },
      'mode': { type: 'string' },
      'name': { type: 'string' },
      'url': { type: 'string' },
      'artifacts-dir': { type: 'string' },
    },
  });

  // `quillmark-mcp config <client>` — pure snippet generator, no side effects.
  if (positionals[0] === 'config') {
    const client = positionals[1];
    if (!client) {
      consoleError(`Usage: quillmark-mcp config <client> [--mode http|stdio] [--name NAME] [--url URL] [--artifacts-dir DIR]`);
      consoleError(`Clients: ${SUPPORTED_CLIENTS.join(', ')}`);
      setExitCode(2);
      return;
    }
    try {
      const mode = values.mode ?? (isSupported(client, 'http') ? 'http' : 'stdio');
      const snippet = generateConfig({
        client,
        mode,
        name: values.name,
        url: values.url,
        artifactsDir: values['artifacts-dir'] ?? `${env.HOME || homedir()}/.quillmark/artifacts`,
      });
      if (snippet.suggestedPath) {
        consoleError(`# Paste into: ${snippet.suggestedPath}`);
      }
      consoleLog(snippet.content.trimEnd());
      if (snippet.notes?.length) {
        for (const note of snippet.notes) consoleError(`# ${note}`);
      }
    } catch (err) {
      consoleError(getErrorMessage(err));
      setExitCode(2);
    }
    return;
  }

  const quiverDirRaw = pick(values['quiver-dir'], env.QUILLMARK_QUIVER_DIR, './quiver');
  const outputDir = pick(values['output-dir'], env.QUILLMARK_OUTPUT_DIR, '.artifacts');
  const bind = pick(values.bind, env.QUILLMARK_BIND, 'localhost:8080');
  const endpoint = pick(values.endpoint, env.QUILLMARK_ENDPOINT, '/mcp');
  const baseUrlOverride = pick(values['base-url'], env.QUILLMARK_BASE_URL, '');
  const useStdio = values.stdio === true || env.QUILLMARK_STDIO === '1';

  const quiverDir = resolveQuiverDir(quiverDirRaw, cwd);
  if (!exists(quiverDir)) {
    consoleError(`Quiver directory does not exist: ${quiverDir}`);
    setExitCode(1);
    return;
  }

  const { host, port } = parseBind(bind);
  const baseUrl = baseUrlOverride || `http://${host}:${port}/artifacts`;

  const strategy = new StrategyClass({ outputDir, baseUrl });
  const mcp = await createMCP({ quiverDir, strategy });

  if (useStdio) {
    await mcp.start({ transportType: 'stdio' });
    consoleError('Transport: stdio');
    return;
  }

  await mcp.start({
    transportType: 'httpStream',
    httpStream: { host, port, endpoint, artifactsDir: outputDir },
  });

  consoleError(`Transport: streamable HTTP`);
  consoleError(`URL: http://${host}:${port}${endpoint}`);
  consoleError(`Get a client snippet: quillmark-mcp config <client> --url http://${host}:${port}${endpoint}`);
  consoleError(`Supported clients: ${SUPPORTED_CLIENTS.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createDefaultMCP } from './mcp/index.js';
import { RenderAndHostStrategy } from './strategies/index.js';

export function resolveQuillsDir(quillsDir, cwd = process.cwd()) {
  return path.isAbsolute(quillsDir) ? quillsDir : path.resolve(cwd, quillsDir);
}

export function parseBind(bind) {
  const lastColon = bind.lastIndexOf(':');
  if (lastColon === -1) throw new Error(`Invalid --bind value "${bind}": expected {host}:{port}`);
  const host = bind.slice(0, lastColon);
  const port = parseInt(bind.slice(lastColon + 1), 10);
  if (!host || Number.isNaN(port)) throw new Error(`Invalid --bind value "${bind}": expected {host}:{port}`);
  return { host, port };
}

function pick(cliValue, envValue, fallback) {
  if (cliValue !== undefined) return cliValue;
  if (envValue !== undefined && envValue !== '') return envValue;
  return fallback;
}

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

  const { values } = parseArgs({
    args: argv,
    options: {
      'quills-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      'base-url': { type: 'string' },
      'bind': { type: 'string' },
      'endpoint': { type: 'string' },
      'stdio': { type: 'boolean', default: false },
    },
  });

  const quillsDirRaw = pick(values['quills-dir'], env.QUILLMARK_QUILLS_DIR, './quills');
  const outputDir = pick(values['output-dir'], env.QUILLMARK_OUTPUT_DIR, '.artifacts');
  const bind = pick(values.bind, env.QUILLMARK_BIND, 'localhost:8080');
  const endpoint = pick(values.endpoint, env.QUILLMARK_ENDPOINT, '/mcp');
  const baseUrlOverride = pick(values['base-url'], env.QUILLMARK_BASE_URL, '');
  const useStdio = values.stdio === true || env.QUILLMARK_STDIO === '1';

  const quillsDir = resolveQuillsDir(quillsDirRaw, cwd);
  if (!exists(quillsDir)) {
    consoleError(`Quills directory does not exist: ${quillsDir}`);
    setExitCode(1);
    return;
  }

  const { host, port } = parseBind(bind);
  const baseUrl = baseUrlOverride || `http://${host}:${port}/artifacts`;

  const strategy = new StrategyClass({ outputDir, baseUrl });
  const mcp = await createMCP({ quillsDir, strategy });

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
  consoleError(`Add to Claude Code: claude mcp add --transport http quillmark http://${host}:${port}${endpoint}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

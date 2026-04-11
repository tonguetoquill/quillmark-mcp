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
  } = deps;

  const { values } = parseArgs({
    args: argv,
    options: {
      'quills-dir': { type: 'string', default: './quills' },
      'output-dir': { type: 'string', default: '.artifacts' },
      'base-url': { type: 'string', default: 'file://' },
      'http': { type: 'boolean', default: true },
      'bind': { type: 'string', default: 'localhost:8080' },
      'endpoint': { type: 'string', default: '/mcp' },
    },
  });

  const quillsDir = resolveQuillsDir(values['quills-dir'], cwd);
  if (!exists(quillsDir)) {
    consoleError(`Quills directory does not exist: ${quillsDir}`);
    setExitCode(1);
    return;
  }

  const strategy = new StrategyClass({
    outputDir: values['output-dir'],
    baseUrl: values['base-url'],
  });

  const mcp = await createMCP({ quillsDir, strategy });

  const { host, port } = parseBind(values.bind);
  const endpoint = values.endpoint;

  await mcp.start({
    transportType: 'httpStream',
    httpStream: { host, port, endpoint },
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

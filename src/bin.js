#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { generateConfig, mcphostConfigJson, SUPPORTED_CLIENTS } from './cli/config.js';
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

  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'quills-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      'base-url': { type: 'string' },
      'bind': { type: 'string' },
      'endpoint': { type: 'string' },
      'stdio': { type: 'boolean', default: false },
      'mode': { type: 'string' },
      'name': { type: 'string' },
      'url': { type: 'string' },
      'artifacts-dir': { type: 'string' },
      'image': { type: 'string' },
      'auth-token': { type: 'string' },
    },
  });

  // `quillmark-mcp mcphost-config` — emit pure JSON for ~/.mcphost.json.
  // Used by scripts/install-ollama.sh. No commentary, just the blob.
  if (positionals[0] === 'mcphost-config') {
    try {
      const json = mcphostConfigJson({
        name: values.name,
        url: values.url,
        authToken: values['auth-token'],
      });
      consoleLog(json.trimEnd());
    } catch (err) {
      consoleError(err instanceof Error ? err.message : String(err));
      setExitCode(2);
    }
    return;
  }

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
      const snippet = generateConfig({
        client,
        mode: values.mode ?? 'http',
        name: values.name,
        url: values.url,
        artifactsDir: values['artifacts-dir'],
        image: values.image,
        authToken: values['auth-token'],
      });
      if (snippet.suggestedPath) {
        consoleError(`# Paste into: ${snippet.suggestedPath}`);
      }
      consoleLog(snippet.content.trimEnd());
      if (snippet.notes?.length) {
        for (const note of snippet.notes) consoleError(`# ${note}`);
      }
    } catch (err) {
      consoleError(err instanceof Error ? err.message : String(err));
      setExitCode(2);
    }
    return;
  }

  const quillsDirRaw = pick(values['quills-dir'], env.QUILLMARK_QUILLS_DIR, './quills');
  const outputDir = pick(values['output-dir'], env.QUILLMARK_OUTPUT_DIR, '.artifacts');
  const bind = pick(values.bind, env.QUILLMARK_BIND, 'localhost:8080');
  const endpoint = pick(values.endpoint, env.QUILLMARK_ENDPOINT, '/mcp');
  const baseUrlOverride = pick(values['base-url'], env.QUILLMARK_BASE_URL, '');
  const useStdio = values.stdio === true || env.QUILLMARK_STDIO === '1';
  const localModelMode = env.QUILLMARK_LOCAL_MODEL_MODE === '1';

  const quillsDir = resolveQuillsDir(quillsDirRaw, cwd);
  if (!exists(quillsDir)) {
    consoleError(`Quills directory does not exist: ${quillsDir}`);
    setExitCode(1);
    return;
  }

  const { host, port } = parseBind(bind);
  const baseUrl = baseUrlOverride || `http://${host}:${port}/artifacts`;

  const strategy = new StrategyClass({ outputDir, baseUrl });
  const mcp = await createMCP({ quillsDir, strategy, localModelMode });

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
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

/**
 * @module test/bin
 * Tests for the CLI entry point (`src/bin.js`).
 *
 * Coverage:
 * - Argument parsing (`--quiver-dir`, `--bind`, `--endpoint`, `--stdio`, `--output-dir`, `--base-url`)
 * - Environment variable fallbacks (`QUILLMARK_*`) and CLI-over-env precedence
 * - Transport selection (streamable HTTP vs stdio)
 * - `config` subcommand (client snippet generation, unknown client rejection, usage)
 * - Error paths (missing Quiver directory)
 *
 * All tests inject dependencies via a `deps` object passed as the second argument
 * to `main()`, avoiding real filesystem access, process mutation, and network I/O.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { main, resolveQuiverDir, parseBind } from '../src/bin.js';

/**
 * Tests for CLI argument parsing, env var fallbacks, transport selection,
 * and the `config` subcommand.
 */
describe('bin', () => {
  it('resolves quiverDir relative to cwd', () => {
    assert.equal(resolveQuiverDir('quills', '/workspace'), '/workspace/quills');
    assert.equal(resolveQuiverDir('/already/absolute', '/workspace'), '/already/absolute');
  });

  it('parseBind splits host and port', () => {
    assert.deepEqual(parseBind('localhost:8080'), { host: 'localhost', port: 8080 });
    assert.deepEqual(parseBind('0.0.0.0:3000'), { host: '0.0.0.0', port: 3000 });
    assert.deepEqual(parseBind('::1:9000'), { host: '::1', port: 9000 });
    assert.throws(() => parseBind('nocolon'), /Invalid --bind/);
  });

  it('returns non-zero exit code when quiverDir does not exist', async () => {
    let stderr = '';
    let exitCode;

    await main(['--quiver-dir', './missing'], {
      cwd: '/workspace',
      env: {},
      exists: () => false,
      consoleError: (message) => {
        stderr = message;
      },
      setExitCode: (code) => {
        exitCode = code;
      },
    });

    assert.equal(exitCode, 1);
    assert.match(stderr, /Quiver directory does not exist: \/workspace\/missing/);
  });

  it('starts MCP with streamable HTTP transport using parsed options', async () => {
    let strategyOptions;
    let startOptions;
    let createMCPOptions;
    const logs = [];

    /**
     * Test double for RenderAndHostStrategy.
     * Captures constructor args into `strategyOptions` for later assertion.
     * @param {{ outputDir: string, baseUrl: string }} options
     */
    class FakeStrategy {
      constructor(options) {
        strategyOptions = options;
      }
    }

    /*
     * Dependency-injected `deps` object replaces real I/O surfaces:
     *   cwd          - simulated working directory
     *   env          - process.env stand-in (empty here; env-var tests below)
     *   exists       - always true to skip directory validation
     *   consoleError - captures stderr output
     *   StrategyClass - swapped with FakeStrategy
     *   createMCP    - returns a stub MCP server that records start() args
     */
    await main(['--quiver-dir', 'quills', '--output-dir', 'out', '--base-url', 'https://host/base'], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleError: (msg) => logs.push(msg),
      StrategyClass: FakeStrategy,
      createMCP: (options) => {
        createMCPOptions = options;
        return { async start(opts) { startOptions = opts; } };
      },
    });

    assert.deepEqual(strategyOptions, { outputDir: 'out', baseUrl: 'https://host/base' });
    assert.equal(createMCPOptions.quiverDir, path.resolve('/workspace', 'quills'));
    assert.ok(createMCPOptions.strategy instanceof FakeStrategy);
    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: 'localhost', port: 8080, endpoint: '/mcp', artifactsDir: 'out' },
    });
    assert.ok(logs.some((l) => l.includes('streamable HTTP')));
    assert.ok(logs.some((l) => l.includes('http://localhost:8080/mcp')));
    assert.ok(logs.some((l) => l.includes('quillmark-mcp config <client>')));
    assert.ok(logs.some((l) => l.includes('Supported clients')));
  });

  it('config subcommand prints a snippet for claude-code http and exits 0', async () => {
    const stdout = [];
    const stderr = [];
    let exitCode = 0;

    await main(['config', 'claude-code'], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleLog: (msg) => stdout.push(msg),
      consoleError: (msg) => stderr.push(msg),
      setExitCode: (code) => { exitCode = code; },
    });

    assert.equal(exitCode, 0);
    assert.equal(stdout.length, 1);
    assert.match(stdout[0], /claude mcp add --transport http quillmark http:\/\/127\.0\.0\.1:8080\/mcp/);
  });

  it('config subcommand resolves $HOME in claude-code stdio args', async () => {
    const stdout = [];
    let exitCode = 0;

    await main(['config', 'claude-code', '--mode', 'stdio'], {
      cwd: '/workspace',
      env: { HOME: '/test/home' },
      exists: () => true,
      consoleLog: (msg) => stdout.push(msg),
      consoleError: () => {},
      setExitCode: (code) => { exitCode = code; },
    });

    assert.equal(exitCode, 0);
    const output = stdout.join('\n');
    assert.match(output, /\/test\/home\/.quillmark\/artifacts/,
      'stdio config must contain resolved home path');
    assert.doesNotMatch(output, /\$HOME/,
      'stdio config must not contain literal $HOME');
  });

  it('config subcommand rejects unknown client with exit 2', async () => {
    let exitCode = 0;
    const stderr = [];

    await main(['config', 'nonsense'], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleError: (msg) => stderr.push(msg),
      setExitCode: (code) => { exitCode = code; },
    });

    assert.equal(exitCode, 2);
    assert.ok(stderr.some((l) => /Unknown client/.test(l)));
  });

  it('config subcommand without a client prints usage and exits 2', async () => {
    let exitCode = 0;
    const stderr = [];

    await main(['config'], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleError: (msg) => stderr.push(msg),
      setExitCode: (code) => { exitCode = code; },
    });

    assert.equal(exitCode, 2);
    assert.ok(stderr.some((l) => /Usage: quillmark-mcp config/.test(l)));
  });

  it('respects --bind and --endpoint args', async () => {
    let startOptions;
    const logs = [];

    await main([
      '--quiver-dir', 'quills',
      '--bind', '0.0.0.0:3000',
      '--endpoint', '/api/mcp',
    ], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleError: (msg) => logs.push(msg),
      StrategyClass: class FakeStrategy {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: '0.0.0.0', port: 3000, endpoint: '/api/mcp', artifactsDir: '.artifacts' },
    });
    assert.ok(logs.some((l) => l.includes('http://0.0.0.0:3000/api/mcp')));
  });

  it('falls back to QUILLMARK_* env vars when CLI flags are absent', async () => {
    let startOptions;
    let createMCPOptions;
    let strategyOptions;

    /** Test double — same as above; captures strategy constructor args. */
    class FakeStrategy {
      constructor(options) {
        strategyOptions = options;
      }
    }

    await main([], {
      cwd: '/workspace',
      env: {
        QUILLMARK_QUIVER_DIR: '/env/quills',
        QUILLMARK_OUTPUT_DIR: '/env/out',
        QUILLMARK_BIND: '0.0.0.0:9000',
        QUILLMARK_ENDPOINT: '/env/mcp',
        QUILLMARK_BASE_URL: 'https://env.example/artifacts',
      },
      exists: () => true,
      consoleError: () => {},
      StrategyClass: FakeStrategy,
      createMCP: (options) => {
        createMCPOptions = options;
        return { async start(opts) { startOptions = opts; } };
      },
    });

    assert.equal(createMCPOptions.quiverDir, '/env/quills');
    assert.deepEqual(strategyOptions, { outputDir: '/env/out', baseUrl: 'https://env.example/artifacts' });
    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: '0.0.0.0', port: 9000, endpoint: '/env/mcp', artifactsDir: '/env/out' },
    });
  });

  it('CLI flags win over env vars', async () => {
    let startOptions;

    await main(['--bind', '127.0.0.1:7777'], {
      cwd: '/workspace',
      env: { QUILLMARK_BIND: '0.0.0.0:9000' },
      exists: () => true,
      consoleError: () => {},
      StrategyClass: class {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.equal(startOptions.httpStream.host, '127.0.0.1');
    assert.equal(startOptions.httpStream.port, 7777);
  });

  it('--stdio flag switches transport to stdio and skips HTTP banner', async () => {
    let startOptions;
    const logs = [];

    await main(['--stdio'], {
      cwd: '/workspace',
      env: {},
      exists: () => true,
      consoleError: (msg) => logs.push(msg),
      StrategyClass: class {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.deepEqual(startOptions, { transportType: 'stdio' });
    assert.ok(logs.some((l) => l.includes('Transport: stdio')));
    assert.ok(!logs.some((l) => l.includes('streamable HTTP')));
  });

  it('QUILLMARK_STDIO=1 env var also switches transport to stdio', async () => {
    let startOptions;

    await main([], {
      cwd: '/workspace',
      env: { QUILLMARK_STDIO: '1' },
      exists: () => true,
      consoleError: () => {},
      StrategyClass: class {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.deepEqual(startOptions, { transportType: 'stdio' });
  });
});

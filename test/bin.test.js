import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { main, resolveQuillsDir, parseBind } from '../src/bin.js';

describe('bin', () => {
  it('resolves quillsDir relative to cwd', () => {
    assert.equal(resolveQuillsDir('quills', '/workspace'), '/workspace/quills');
    assert.equal(resolveQuillsDir('/already/absolute', '/workspace'), '/already/absolute');
  });

  it('parseBind splits host and port', () => {
    assert.deepEqual(parseBind('localhost:8080'), { host: 'localhost', port: 8080 });
    assert.deepEqual(parseBind('0.0.0.0:3000'), { host: '0.0.0.0', port: 3000 });
    assert.deepEqual(parseBind('::1:9000'), { host: '::1', port: 9000 });
    assert.throws(() => parseBind('nocolon'), /Invalid --bind/);
  });

  it('returns non-zero exit code when quillsDir does not exist', async () => {
    let stderr = '';
    let exitCode;

    await main(['--quills-dir', './missing'], {
      cwd: '/workspace',
      exists: () => false,
      consoleError: (message) => {
        stderr = message;
      },
      setExitCode: (code) => {
        exitCode = code;
      },
    });

    assert.equal(exitCode, 1);
    assert.match(stderr, /Quills directory does not exist: \/workspace\/missing/);
  });

  it('starts MCP with streamable HTTP transport using parsed options', async () => {
    let strategyOptions;
    let startOptions;
    let createMCPOptions;
    const logs = [];

    class FakeStrategy {
      constructor(options) {
        strategyOptions = options;
      }
    }

    await main(['--quills-dir', 'quills', '--output-dir', 'out', '--base-url', 'https://host/base'], {
      cwd: '/workspace',
      exists: () => true,
      consoleError: (msg) => logs.push(msg),
      StrategyClass: FakeStrategy,
      createMCP: (options) => {
        createMCPOptions = options;
        return { async start(opts) { startOptions = opts; } };
      },
    });

    assert.deepEqual(strategyOptions, { outputDir: 'out', baseUrl: 'https://host/base' });
    assert.equal(createMCPOptions.quillsDir, path.resolve('/workspace', 'quills'));
    assert.ok(createMCPOptions.strategy instanceof FakeStrategy);
    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: 'localhost', port: 8080, endpoint: '/mcp' },
    });
    assert.ok(logs.some((l) => l.includes('streamable HTTP')));
    assert.ok(logs.some((l) => l.includes('http://localhost:8080/mcp')));
    assert.ok(logs.some((l) => l.includes('claude mcp add --transport http')));
  });

  it('accepts the --http flag explicitly and still starts streamable HTTP', async () => {
    let startOptions;

    await main(['--quills-dir', 'quills', '--http'], {
      cwd: '/workspace',
      exists: () => true,
      consoleError: () => {},
      StrategyClass: class FakeStrategy {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: 'localhost', port: 8080, endpoint: '/mcp' },
    });
  });

  it('respects --bind and --endpoint args', async () => {
    let startOptions;
    const logs = [];

    await main([
      '--quills-dir', 'quills',
      '--bind', '0.0.0.0:3000',
      '--endpoint', '/api/mcp',
    ], {
      cwd: '/workspace',
      exists: () => true,
      consoleError: (msg) => logs.push(msg),
      StrategyClass: class FakeStrategy {},
      createMCP: () => ({ async start(opts) { startOptions = opts; } }),
    });

    assert.deepEqual(startOptions, {
      transportType: 'httpStream',
      httpStream: { host: '0.0.0.0', port: 3000, endpoint: '/api/mcp' },
    });
    assert.ok(logs.some((l) => l.includes('http://0.0.0.0:3000/api/mcp')));
  });
});

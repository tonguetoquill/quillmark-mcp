import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { main, resolveQuillsDir } from '../src/bin.js';

describe('bin', () => {
  it('resolves quillsDir relative to cwd', () => {
    assert.equal(resolveQuillsDir('quills', '/workspace'), '/workspace/quills');
    assert.equal(resolveQuillsDir('/already/absolute', '/workspace'), '/already/absolute');
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

  it('starts MCP with parsed options', async () => {
    let strategyOptions;
    let started = false;
    let createMCPOptions;

    class FakeStrategy {
      constructor(options) {
        strategyOptions = options;
      }
    }

    await main(['--quills-dir', 'quills', '--output-dir', 'out', '--base-url', 'https://host/base'], {
      cwd: '/workspace',
      exists: () => true,
      StrategyClass: FakeStrategy,
      createMCP: (options) => {
        createMCPOptions = options;
        return { async start() { started = true; } };
      },
    });

    assert.deepEqual(strategyOptions, {
      outputDir: 'out',
      baseUrl: 'https://host/base',
    });

    assert.equal(createMCPOptions.quillsDir, path.resolve('/workspace', 'quills'));
    assert.ok(createMCPOptions.strategy instanceof FakeStrategy);
    assert.equal(started, true);
  });
});

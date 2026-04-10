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
    let constructorOptions;

    class FakeStrategy {
      constructor(options) {
        strategyOptions = options;
      }
    }

    class FakeMCP {
      constructor(options) {
        constructorOptions = options;
      }

      async start() {
        started = true;
      }
    }

    await main(['--quills-dir', 'quills', '--output-dir', 'out', '--base-url', 'https://host/base'], {
      cwd: '/workspace',
      exists: () => true,
      StrategyClass: FakeStrategy,
      MCPClass: FakeMCP,
    });

    assert.deepEqual(strategyOptions, {
      outputDir: 'out',
      baseUrl: 'https://host/base',
    });

    assert.equal(constructorOptions.quillsDir, path.resolve('/workspace', 'quills'));
    assert.ok(constructorOptions.strategy instanceof FakeStrategy);
    assert.equal(started, true);
  });
});

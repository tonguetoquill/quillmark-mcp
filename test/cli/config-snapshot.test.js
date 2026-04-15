/**
 * @module config-snapshot
 *
 * Golden-fixture snapshot tests for generateConfig across Claude Code + Codex.
 *
 * Regenerate with UPDATE_SNAPSHOTS=1 npm test.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { generateConfig, SUPPORTED_CLIENTS, isSupported } from '../../src/cli/config.js';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'configs',
);

const EXTENSIONS = {
  toml: 'toml',
  shell: 'sh.snap',
};

const MODES = ['http', 'stdio'];
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

async function ensureFixtureDir() {
  if (!existsSync(FIXTURE_DIR)) {
    await mkdir(FIXTURE_DIR, { recursive: true });
  }
}

function fixturePath(client, mode, format) {
  const ext = EXTENSIONS[format] ?? 'txt';
  return path.join(FIXTURE_DIR, `${client}-${mode}.${ext}`);
}

describe('src/cli/config.js — snippet generator', () => {
  for (const client of SUPPORTED_CLIENTS) {
    for (const mode of MODES) {
      if (!isSupported(client, mode)) continue;

      it(`${client} / ${mode} matches fixture`, async () => {
        const snippet = generateConfig({ client, mode });
        assert.ok(snippet.content.length > 0, 'empty snippet');
        assert.ok(typeof snippet.format === 'string', 'missing format');

        await ensureFixtureDir();
        const file = fixturePath(client, mode, snippet.format);

        if (UPDATE || !existsSync(file)) {
          await writeFile(file, snippet.content, 'utf8');
          return;
        }
        const expected = await readFile(file, 'utf8');
        assert.equal(
          snippet.content,
          expected,
          `snippet for ${client}/${mode} drifted from ${path.relative(process.cwd(), file)}. ` +
            `Re-run with UPDATE_SNAPSHOTS=1 to refresh.`,
        );
      });
    }
  }

  it('rejects unknown client', () => {
    assert.throws(() => generateConfig({ client: 'cursor' }), /Unknown client/);
  });

  it('rejects unsupported mode for client', () => {
    assert.throws(
      () => generateConfig({ client: 'claude-code', mode: 'sse' }),
      /does not support mode/,
    );
  });

  it('Codex TOML snippet declares mcp_servers table', () => {
    const snippet = generateConfig({ client: 'codex', mode: 'http' });
    assert.match(snippet.content, /^\[mcp_servers\.quillmark\]/m);
    assert.match(snippet.content, /^url = "http:\/\/127\.0\.0\.1:8080\/mcp"/m);
  });

  it('Codex stdio TOML embeds docker args array', () => {
    const snippet = generateConfig({ client: 'codex', mode: 'stdio' });
    assert.match(snippet.content, /command = "docker"/);
    assert.match(snippet.content, /args = \[/);
    assert.match(snippet.content, /"--stdio"/);
  });

  it('Claude Code HTTP emits claude mcp add command', () => {
    const snippet = generateConfig({ client: 'claude-code', mode: 'http' });
    assert.match(snippet.content, /^claude mcp add --transport http quillmark /);
  });

  it('Claude Code stdio emits docker-bridge command', () => {
    const snippet = generateConfig({ client: 'claude-code', mode: 'stdio' });
    assert.match(snippet.content, /^claude mcp add quillmark -- docker run/);
  });

  it('auth-token is threaded into Claude Code HTTP header', () => {
    const snippet = generateConfig({
      client: 'claude-code',
      mode: 'http',
      authToken: 'TESTTOKEN',
    });
    assert.match(snippet.content, /--header "Authorization: Bearer TESTTOKEN"/);
  });

  it('--name override changes the server key', () => {
    const snippet = generateConfig({
      client: 'codex',
      mode: 'http',
      name: 'quillmark-dev',
    });
    assert.match(snippet.content, /^\[mcp_servers\.quillmark-dev\]/m);
  });

  it('--url override is reflected in generated content', () => {
    const snippet = generateConfig({
      client: 'codex',
      mode: 'http',
      url: 'https://remote.example.com/mcp',
    });
    assert.match(snippet.content, /url = "https:\/\/remote\.example\.com\/mcp"/);
  });
});

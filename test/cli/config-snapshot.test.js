// Golden-fixture tests for src/cli/config.js.
//
// Every supported (client, mode) pair generates a snippet; we diff against
// test/fixtures/configs/<client>-<mode>.<ext>. Regenerate with
// UPDATE_SNAPSHOTS=1 npm test, then review + commit the diff.
//
// Extra assertions: parse JSON/TOML snippets to prove they're syntactically
// valid. Catches schema drift that a pure string diff would miss.
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

// Fixture extensions: code-sample snippets intentionally do NOT use .js/.mjs
// because Node's --test runner picks up any .js file under test/ and tries to
// execute it. .snap is the Jest convention and Node ignores it.
const EXTENSIONS = {
  json: 'json',
  toml: 'toml',
  yaml: 'yaml',
  text: 'txt',
  shell: 'sh.snap',
  js: 'js.snap',
  python: 'py.snap',
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
    assert.throws(() => generateConfig({ client: 'fabricated-client' }), /Unknown client/);
  });

  it('rejects unsupported mode for client', () => {
    assert.throws(() => generateConfig({ client: 'claude-desktop', mode: 'http' }), /does not support mode/);
  });

  it('JSON snippets parse cleanly', () => {
    for (const client of SUPPORTED_CLIENTS) {
      for (const mode of MODES) {
        if (!isSupported(client, mode)) continue;
        const snippet = generateConfig({ client, mode });
        if (snippet.format !== 'json') continue;
        const parsed = JSON.parse(snippet.content);
        assert.ok(parsed && typeof parsed === 'object', `${client}/${mode}: JSON.parse returned non-object`);
      }
    }
  });

  it('Claude Desktop snippet uses mcpServers key (not servers)', () => {
    const snippet = generateConfig({ client: 'claude-desktop', mode: 'stdio' });
    const parsed = JSON.parse(snippet.content);
    assert.ok(parsed.mcpServers, 'Claude Desktop must use mcpServers key');
    assert.ok(parsed.mcpServers.quillmark, 'default server name must be present');
    assert.equal(parsed.mcpServers.quillmark.command, 'docker');
  });

  it('VS Code snippet uses servers key (not mcpServers) — critical footgun', () => {
    const snippet = generateConfig({ client: 'vscode', mode: 'http' });
    const parsed = JSON.parse(snippet.content);
    assert.ok(parsed.servers, 'VS Code MUST use "servers" key, not "mcpServers"');
    assert.equal(parsed.mcpServers, undefined, 'VS Code snippet must not include mcpServers key');
    assert.equal(parsed.servers.quillmark.type, 'http');
  });

  it('Cursor snippet uses mcpServers key and direct url field', () => {
    const snippet = generateConfig({ client: 'cursor', mode: 'http' });
    const parsed = JSON.parse(snippet.content);
    assert.equal(parsed.mcpServers.quillmark.url, 'http://127.0.0.1:8080/mcp');
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

  it('auth-token is threaded into HTTP snippets as bearer', () => {
    const snippet = generateConfig({
      client: 'cursor',
      mode: 'http',
      authToken: 'TESTTOKEN',
    });
    const parsed = JSON.parse(snippet.content);
    assert.equal(
      parsed.mcpServers.quillmark.headers?.Authorization,
      'Bearer TESTTOKEN',
    );
  });

  it('--name override changes the server key', () => {
    const snippet = generateConfig({ client: 'cursor', mode: 'http', name: 'quillmark-dev' });
    const parsed = JSON.parse(snippet.content);
    assert.ok(parsed.mcpServers['quillmark-dev']);
    assert.equal(parsed.mcpServers.quillmark, undefined);
  });

  it('--url override is reflected in generated content', () => {
    const snippet = generateConfig({
      client: 'cursor',
      mode: 'http',
      url: 'https://remote.example.com/mcp',
    });
    const parsed = JSON.parse(snippet.content);
    assert.equal(parsed.mcpServers.quillmark.url, 'https://remote.example.com/mcp');
  });

  it('ChatGPT walkthrough is text and mentions the URL', () => {
    const snippet = generateConfig({ client: 'chatgpt', mode: 'http' });
    assert.equal(snippet.format, 'text');
    assert.match(snippet.content, /http:\/\/127\.0\.0\.1:8080\/mcp/);
    assert.match(snippet.content, /Developer Mode/);
  });
});

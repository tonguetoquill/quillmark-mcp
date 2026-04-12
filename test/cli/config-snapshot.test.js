/**
 * @module config-snapshot
 *
 * Golden-fixture snapshot tests for {@link module:src/cli/config generateConfig}.
 *
 * For every supported `(client, mode)` pair the generator emits a config
 * snippet; we diff its output byte-for-byte against a committed fixture in
 * `test/fixtures/configs/<client>-<mode>.<ext>`. This catches accidental
 * schema drift, key renames, and formatting regressions.
 *
 * **Regeneration**: `UPDATE_SNAPSHOTS=1 npm test` writes new fixtures in
 * place. Review the diff, then commit.
 *
 * Supplementary assertions parse the generated JSON/TOML to prove syntactic
 * validity and enforce client-specific key contracts (e.g. VS Code `servers`
 * vs Claude Desktop `mcpServers`).
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { generateConfig, SUPPORTED_CLIENTS, isSupported } from '../../src/cli/config.js';

/**
 * Absolute path to `test/fixtures/configs/` — the directory holding committed
 * golden snapshots. Resolved relative to this file so it works regardless of
 * the working directory `node --test` is invoked from.
 *
 * @constant {string}
 */
const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'configs',
);

/**
 * Map from snippet format to fixture file extension. Code-sample formats use
 * `.snap` suffixes (e.g. `js.snap`, `sh.snap`) so Node's `--test` runner does
 * not accidentally pick them up as executable test files.
 *
 * @constant {Record<string, string>}
 */
const EXTENSIONS = {
  json: 'json',
  toml: 'toml',
  yaml: 'yaml',
  text: 'txt',
  shell: 'sh.snap',
  js: 'js.snap',
  python: 'py.snap',
};

/** @constant {string[]} Transport modes under test. */
const MODES = ['http', 'stdio'];

/**
 * When `UPDATE_SNAPSHOTS=1` is set in the environment, snapshot mismatches
 * overwrite the fixture on disk instead of failing. This lets you regenerate
 * all golden files in one pass, then inspect the diff before committing.
 *
 * @constant {boolean}
 */
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

/**
 * Lazily creates the fixture directory if it does not yet exist.
 * @returns {Promise<void>}
 */
async function ensureFixtureDir() {
  if (!existsSync(FIXTURE_DIR)) {
    await mkdir(FIXTURE_DIR, { recursive: true });
  }
}

/**
 * Derives the fixture file path for a given `(client, mode, format)` triple.
 * @param {string} client - e.g. `"cursor"`, `"claude-desktop"`
 * @param {string} mode   - `"http"` or `"stdio"`
 * @param {string} format - snippet format key (maps through {@link EXTENSIONS})
 * @returns {string} Absolute path to the fixture file
 */
function fixturePath(client, mode, format) {
  const ext = EXTENSIONS[format] ?? 'txt';
  return path.join(FIXTURE_DIR, `${client}-${mode}.${ext}`);
}

describe('src/cli/config.js — snippet generator', () => {
  /*
   * Cartesian product: SUPPORTED_CLIENTS x MODES.
   * Unsupported combos (e.g. claude-desktop + http) are skipped via
   * `isSupported()`. Each surviving pair gets a fixture-diff test case
   * registered dynamically with `it()`.
   */
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

  /**
   * Claude Desktop expects `mcpServers` at the top level — using `servers`
   * silently breaks registration. Assert the key name AND that the default
   * server entry (`quillmark`) is present with `command: "docker"`.
   */
  it('Claude Desktop snippet uses mcpServers key (not servers)', () => {
    const snippet = generateConfig({ client: 'claude-desktop', mode: 'stdio' });
    const parsed = JSON.parse(snippet.content);
    assert.ok(parsed.mcpServers, 'Claude Desktop must use mcpServers key');
    assert.ok(parsed.mcpServers.quillmark, 'default server name must be present');
    assert.equal(parsed.mcpServers.quillmark.command, 'docker');
  });

  /**
   * VS Code is the opposite of Claude Desktop: it requires `servers` (not
   * `mcpServers`). Having both keys present is also wrong — assert absence
   * of `mcpServers` explicitly.
   */
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

  /**
   * When `authToken` is supplied, the generator must inject an
   * `Authorization: Bearer <token>` header into the snippet. Verifies the
   * token value round-trips through generation + JSON parse intact.
   */
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

  /**
   * `--name` lets users register the same MCP server under a custom key
   * (e.g. `quillmark-dev`). Assert the override replaces — not supplements —
   * the default `quillmark` key.
   */
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

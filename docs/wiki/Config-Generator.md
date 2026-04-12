# Config Generator

The config generator (`src/cli/config.js`) is a **pure function** that emits ready-to-paste configuration snippets for 12 MCP clients. It performs no file I/O, no network calls, and no Docker operations -- it only templates strings. This is what makes the golden snapshot tests deterministic.

The caller resolves environment-dependent values (absolute `artifactsDir` path, custom URL/port, auth token) and passes them in. The generator itself only formats output.

## Supported Clients

| Client | Supported Modes | Output Format | Suggested Path |
|---|---|---|---|
| `claude-code` | http, stdio | shell | _none (CLI command)_ |
| `claude-desktop` | stdio | json | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| `cursor` | http | json | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) |
| `vscode` | http | json | `.vscode/mcp.json` (workspace) |
| `cline` | http | json | VS Code globalStorage `saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| `continue` | http | json | `.continue/mcpServers/<name>.json` |
| `codex` | http, stdio | toml | `~/.codex/config.toml` or `.codex/config.toml` |
| `chatgpt` | http | text | _none (web UI walkthrough)_ |
| `openai-responses` | http | js | _none (code sample)_ |
| `openai-agents` | http | python | _none (code sample)_ |
| `ollama-mcphost` | http | text | `~/.mcphost.json` |
| `ollama-mcpo` | stdio | text | _none (CLI walkthrough)_ |

## `generateConfig(opts)` API

```js
import { generateConfig } from './src/cli/config.js';

const snippet = generateConfig({
  client: 'cursor',          // required -- one of SUPPORTED_CLIENTS
  mode: 'http',              // 'http' | 'stdio' (default: 'http')
  name: 'quillmark',         // MCP server name (default: 'quillmark')
  url: 'http://127.0.0.1:8080/mcp',  // HTTP endpoint (default)
  artifactsDir: '$HOME/.quillmark/artifacts',  // host path for rendered output
  image: 'quillmark-mcp:dev',  // Docker image tag for stdio mode
  authToken: 'my-secret',   // optional Bearer token
});
```

### Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `client` | `string` | _(required)_ | Target client identifier |
| `mode` | `'http' \| 'stdio'` | `'http'` | Transport mode; throws if client doesn't support it |
| `name` | `string` | `'quillmark'` | MCP server name registered with the client |
| `url` | `string` | `'http://127.0.0.1:8080/mcp'` | HTTP endpoint URL |
| `artifactsDir` | `string` | `'$HOME/.quillmark/artifacts'` | Host directory for rendered output (bind-mounted in stdio) |
| `image` | `string` | `'quillmark-mcp:dev'` | Docker image tag for stdio containers |
| `authToken` | `string` | `undefined` | Bearer token injected into the generated config |

### Return Shape

```js
{
  format: 'json' | 'toml' | 'yaml' | 'text' | 'shell' | 'js' | 'python',
  suggestedPath: string | null,  // file to paste into, or null for CLI/code/walkthrough
  content: string,               // the snippet -- always newline-terminated
  notes: string[],               // short caveats printed alongside the snippet
}
```

## Auth Token Threading

When `authToken` is set, each client template injects it in the format the client expects:

| Client Type | How the Token Appears |
|---|---|
| JSON clients (Cursor, VS Code, Cline, Continue) | `{ "headers": { "Authorization": "Bearer <token>" } }` merged into the server entry |
| Claude Code (http) | `--header "Authorization: Bearer <token>"` flag on the `claude mcp add` command |
| Codex (http) | `bearer_token_env_var = "QUILLMARK_TOKEN"` in TOML (reads from env at runtime) |
| OpenAI Responses | `headers: { Authorization: 'Bearer <token>' }` in the JS tool config |
| OpenAI Agents | Embedded in the `params` dict: `'headers': {'Authorization': 'Bearer <token>'}` |
| MCPHost | `"headers": ["Authorization: Bearer <token>"]` (array of strings, MCPHost-specific) |
| ChatGPT | Mentioned as "OAuth or bearer token" in the walkthrough text |

## Golden Fixture Testing

Every `(client, mode)` pair has a committed golden fixture under `test/fixtures/configs/<client>-<mode>.<ext>`. The snapshot test (`test/cli/config-snapshot.test.js`) diffs generated output byte-for-byte against these fixtures.

**To regenerate fixtures after an intentional change:**

```sh
UPDATE_SNAPSHOTS=1 npm test
```

This writes new fixtures in place. Review the diff, then commit. Without `UPDATE_SNAPSHOTS=1`, any drift causes a test failure with a message pointing to the drifted file.

Supplementary assertions beyond snapshot matching:

- All JSON snippets parse cleanly via `JSON.parse`
- Claude Desktop uses the `mcpServers` key (not `servers`)
- VS Code uses the `servers` key (not `mcpServers`) -- the biggest copy-paste footgun in the MCP ecosystem
- Cursor uses `mcpServers` with a direct `url` field
- Codex TOML declares a `[mcp_servers.<name>]` table
- Auth tokens round-trip through generation and parse intact
- `--name` override replaces (not supplements) the default `quillmark` key

## CLI Usage

The `config` subcommand on `src/bin.js` delegates directly to `generateConfig`:

```sh
# Generate a Cursor HTTP config snippet
node src/bin.js config cursor

# Generate a Claude Code stdio config
node src/bin.js config claude-code --mode stdio

# With overrides
node src/bin.js config vscode --mode http \
  --url https://remote.example.com/mcp \
  --auth-token MY_TOKEN \
  --name quillmark-dev
```

The output is syntax-highlighted based on the `format` field. If `suggestedPath` is non-null, it is printed as a hint above the snippet.

### Adding a New Client

1. Add an entry to `SUPPORTED` in `src/cli/config.js` with supported mode(s).
2. Add a templating function and wire it into the `switch` in `generateConfig`.
3. Run `UPDATE_SNAPSHOTS=1 npm test` to seed the golden fixture. Review the diff.
4. Add a walkthrough doc at `docs/clients/<client>.md`.
5. Link it from `docs/clients/index.md` and the per-client list in `README.md`.

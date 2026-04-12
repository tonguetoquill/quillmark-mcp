# CLI Reference

Complete reference for the `quillmark-mcp` command-line interface (`src/bin.js`).

---

## Usage

```
quillmark-mcp [options]                        # Start MCP server (default)
quillmark-mcp config <client> [options]        # Emit client config snippet
quillmark-mcp mcphost-config [options]         # Emit MCPHost JSON blob
```

---

## CLI Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--quills-dir` | string | `./quills` | Path to quill template directory (relative or absolute) |
| `--output-dir` | string | `.artifacts` | Rendered artifact output directory |
| `--base-url` | string | `http://{host}:{port}/artifacts` | Public base URL for served artifacts |
| `--bind` | string | `localhost:8080` | `host:port` to listen on (HTTP mode) |
| `--endpoint` | string | `/mcp` | HTTP path for the MCP endpoint |
| `--stdio` | boolean | `false` | Use stdio transport instead of HTTP |
| `--mode` | string | `http` | Transport mode for `config` subcommand (`http` or `stdio`) |
| `--name` | string | `quillmark` | Server name for config / mcphost-config output |
| `--url` | string | `http://127.0.0.1:8080/mcp` | Server URL for config / mcphost-config output |
| `--artifacts-dir` | string | `$HOME/.quillmark/artifacts` | Host artifacts directory for config output |
| `--image` | string | `quillmark-mcp:dev` | Docker image tag for config output (stdio mode) |
| `--auth-token` | string | _(none)_ | Bearer token for config / mcphost-config output |

---

## Subcommands

### Default -- Server Start

When invoked with no subcommand, the CLI resolves options, validates the quills directory, and starts the MCP server.

```bash
# Start HTTP server on default localhost:8080
quillmark-mcp

# Start with custom bind address and quills directory
quillmark-mcp --bind 0.0.0.0:9090 --quills-dir /path/to/quills

# Start in stdio mode
quillmark-mcp --stdio

# Override the artifact base URL
quillmark-mcp --base-url https://cdn.example.com/artifacts
```

The server start path:

1. Resolves `quillsDir` to an absolute path (relative paths resolve against `cwd`).
2. Validates the quills directory exists (exits with code 1 if missing).
3. Parses the `--bind` value into host and port.
4. Builds a `RenderAndHostStrategy` with `outputDir` and `baseUrl`.
5. Creates the MCP server instance.
6. Starts transport (stdio or streamable HTTP).

### `config <client>`

Generates a ready-to-paste config snippet for a specific MCP client. Pure output -- no side effects, no files written.

```bash
# HTTP mode config for Claude Code
quillmark-mcp config claude-code

# stdio mode config for Claude Desktop
quillmark-mcp config claude-desktop --mode stdio

# Config with a custom server URL and auth token
quillmark-mcp config cursor --url https://mcp.example.com/mcp --auth-token s3cret

# Config for Codex with a custom Docker image
quillmark-mcp config codex --mode stdio --image quillmark-mcp:v1.2.0
```

**Supported clients:**

| Client | Modes | Config format |
|--------|-------|---------------|
| `claude-code` | http, stdio | Shell command |
| `claude-desktop` | stdio | JSON |
| `cursor` | http | JSON |
| `vscode` | http | JSON |
| `cline` | http | JSON |
| `continue` | http | JSON |
| `codex` | http, stdio | TOML |
| `chatgpt` | http | Walkthrough text |
| `openai-responses` | http | JavaScript |
| `openai-agents` | http | Python |
| `ollama-mcphost` | http | Walkthrough text |
| `ollama-mcpo` | stdio | Walkthrough text |

If the client does not support the requested `--mode`, the CLI prints an error and exits with code 2.

The config snippet is printed to **stdout**. Metadata (suggested file path, notes) is printed to **stderr** so piping `> file.json` captures only the snippet.

### `mcphost-config`

Emits a minimal JSON blob suitable for `~/.mcphost.json`. Used by `scripts/install-ollama.sh`.

```bash
# Default config
quillmark-mcp mcphost-config
# Output:
# {
#   "mcpServers": {
#     "quillmark": {
#       "type": "remote",
#       "url": "http://127.0.0.1:8080/mcp"
#     }
#   }
# }

# Custom name, URL, and auth
quillmark-mcp mcphost-config --name myserver --url https://mcp.example.com/mcp --auth-token abc123
```

Output goes to **stdout** only (no stderr commentary). Errors exit with code 2.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error (e.g., quills directory not found, server crash) |
| `2` | Usage error (e.g., unknown client, unsupported mode, invalid `--bind` format) |

---

## Value Precedence (`pick()`)

Every server-start option is resolved via the `pick()` function:

```
CLI flag  >  environment variable  >  fallback default
```

Specifically:

1. If the CLI flag is not `undefined`, it wins.
2. Otherwise, if the env var is defined and non-empty (`!== ''`), it wins.
3. Otherwise, the hardcoded fallback is used.

| Option | CLI Flag | Env Var | Fallback |
|--------|----------|---------|----------|
| Quills directory | `--quills-dir` | `QUILLMARK_QUILLS_DIR` | `./quills` |
| Output directory | `--output-dir` | `QUILLMARK_OUTPUT_DIR` | `.artifacts` |
| Bind address | `--bind` | `QUILLMARK_BIND` | `localhost:8080` |
| MCP endpoint | `--endpoint` | `QUILLMARK_ENDPOINT` | `/mcp` |
| Base URL | `--base-url` | `QUILLMARK_BASE_URL` | `http://{host}:{port}/artifacts` |

Two options use boolean/toggle logic outside `pick()`:

- **stdio**: `--stdio` flag OR `QUILLMARK_STDIO=1` (either triggers stdio mode).
- **local model mode**: `QUILLMARK_LOCAL_MODEL_MODE=1` only (no CLI flag).

---

## Transport Decision

```
--stdio flag is true  OR  QUILLMARK_STDIO=1
    --> stdio transport
    --> prints "Transport: stdio" to stderr

otherwise
    --> streamable HTTP transport
    --> prints banner to stderr (see below)
```

---

## Banner Output (HTTP Mode)

When starting in HTTP mode, the CLI writes four lines to **stderr**:

```
Transport: streamable HTTP
URL: http://localhost:8080/mcp
Get a client snippet: quillmark-mcp config <client> --url http://localhost:8080/mcp
Supported clients: claude-code, claude-desktop, cursor, vscode, cline, continue, codex, chatgpt, openai-responses, openai-agents, ollama-mcphost, ollama-mcpo
```

The host, port, and endpoint values reflect the resolved `--bind` and `--endpoint`.

In stdio mode, only one line is written to stderr:

```
Transport: stdio
```

Banner output goes to stderr so it does not interfere with MCP protocol traffic on stdout.

---

## Bind Address Parsing

The `--bind` value is parsed by splitting on the **last** colon, so IPv6 addresses work:

```bash
quillmark-mcp --bind localhost:3000      # host=localhost, port=3000
quillmark-mcp --bind 0.0.0.0:8080       # host=0.0.0.0,   port=8080
quillmark-mcp --bind "[::1]:8080"        # host=[::1],     port=8080
```

The parser rejects values with no colon, an empty host, or a non-numeric port (exit code via thrown error).

---

## Examples

```bash
# Minimal: start server with defaults
quillmark-mcp

# Docker Compose (env vars set in compose file)
docker compose up -d

# Generate and pipe config directly into a file
quillmark-mcp config cursor > .cursor/mcp.json

# stdio mode for Claude Code registration
claude mcp add quillmark -- docker run -i --rm \
  --user 10001:10001 --read-only --tmpfs /tmp \
  --cap-drop=ALL --security-opt=no-new-privileges:true \
  -v $HOME/.quillmark/artifacts:$HOME/.quillmark/artifacts \
  -e QUILLMARK_OUTPUT_DIR=$HOME/.quillmark/artifacts \
  -e QUILLMARK_BASE_URL=file:// \
  -e QUILLMARK_STDIO=1 \
  quillmark-mcp:dev --stdio
```

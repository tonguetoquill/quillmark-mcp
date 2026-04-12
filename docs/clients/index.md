# Client Setup

quillmark-mcp speaks [Model Context Protocol](https://modelcontextprotocol.io/) and ships as a Docker container. The server itself is fully client-agnostic — any MCP 2.0 client that speaks **Streamable HTTP** or **stdio** can connect to it. The differences between clients are only in *where you paste the config*.

> **Validation status varies by client.** See [`../STATUS.md`](../STATUS.md) for the authoritative matrix. Two stacks are end-to-end validated; the rest are in progress and tracked as GitHub issues.

## The 30-second version

```sh
./scripts/install-mcp.sh
# → HTTP server running at http://127.0.0.1:8080/mcp
# → prints a copy-paste snippet for every supported client
```

Then open the doc for your client below and paste the snippet it generated.

## Pick your client

| Client | Transport | Status | Runs where | Notes |
|---|---|---|---|---|
| [Claude Code](./claude-code.md) | HTTP | ✅ Tested | Local CLI | Recommended for Anthropic devs |
| [Ollama via MCPHost](./ollama.md) | HTTP sidecar | ✅ Tested (`qwen3:8b` only) | Local CLI | Automated setup via `./scripts/install-ollama.sh` |
| [Claude Desktop](./claude-desktop.md) | stdio | 🚧 In progress | Local GUI | Only stdio is supported — see doc for why |
| [Cursor](./cursor.md) | HTTP | 🚧 In progress | Local IDE | `.cursor/mcp.json` |
| [VS Code Copilot](./vscode.md) | HTTP | 🚧 In progress | Local IDE | ⚠ uses `servers` key, not `mcpServers` |
| [Cline](./cline.md) | HTTP | 🚧 In progress | VS Code extension | `cline_mcp_settings.json` |
| [Continue](./continue.md) | HTTP | 🚧 In progress | VS Code / JetBrains | `.continue/mcpServers/*.json` |
| [Codex CLI](./codex.md) | HTTP | ✅ Tested | OpenAI CLI | `~/.codex/config.toml` |
| [ChatGPT Business+](./chatgpt.md) | HTTP | 🚧 In progress | Web (cloud) | Requires a **public** URL — see doc |
| [OpenAI Responses API](./openai-api.md) | HTTP (hosted) | 🚧 In progress | Your code | Responses API + Agents SDK samples |
| [OpenAI Agents SDK](./openai-api.md) | HTTP / stdio | 🚧 In progress | Your code | Agents SDK supports local MCP |
| [Ollama via MCPO](./ollama.md) | stdio | 🚧 In progress | Open WebUI | OpenAPI bridge |

See [`../STATUS.md`](../STATUS.md) for evidence, tracking issues, and how to flip an "In progress" row to Tested.

## Generating snippets directly

If you'd rather not run the installer, the CLI can print any snippet on demand:

```sh
node src/bin.js config <client> [--mode http|stdio] [--url URL] [--name NAME]
```

Examples:

```sh
node src/bin.js config claude-code
node src/bin.js config vscode --url http://127.0.0.1:9090/mcp
node src/bin.js config cursor --name quillmark-dev
node src/bin.js config ollama-mcphost
```

The generator is pure — no side effects, no file writes. It prints to stdout; you copy it into your client's config.

## Running the server

Two deployment shapes are supported. Pick one.

### HTTP — single long-running container (default)

```sh
docker compose up -d
# → 127.0.0.1:8080/mcp
```

Every HTTP-capable client points at `http://127.0.0.1:8080/mcp`. One container serves all of them concurrently (stateless Streamable HTTP, SDK 1.29+). This is the default and what `install-mcp.sh` sets up.

### stdio — per-session ephemeral containers

Used only by Claude Desktop today (its JSON config doesn't accept HTTP URLs) and by Ollama via MCPO (the MCPO bridge wants a stdio target). Each client session spawns a fresh `docker run -i --rm … --stdio` container; no long-running process.

See the per-client docs for the exact `docker run` line — the snippet generator fills in the matching-path bind mount and env vars for you.

## Verifying the server is up

Regardless of client, you can confirm the HTTP server speaks MCP:

```sh
curl -s -X POST http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}' | head -c 400
```

Expected: a JSON-RPC result block with `serverInfo` and `capabilities.tools`.

## Architecture at a glance

```
  ┌─────────────┐        stdio or Streamable HTTP       ┌──────────────────────┐
  │ MCP client  │ ─────────────────────────────────────▶│ quillmark-mcp server │
  │ (any of     │         JSON-RPC 2.0                  │ (Docker container)   │
  │  above)     │                                       │                      │
  └─────────────┘                                       │ 3 tools:             │
                                                        │  list_quills         │
                                                        │  get_specs           │
                                                        │  create_document     │
                                                        └──────────────────────┘
```

The server is identical regardless of which client is on the other end. Tools are pure functions with no per-session state; concurrent clients never interfere.

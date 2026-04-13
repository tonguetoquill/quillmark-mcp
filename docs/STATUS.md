# Validation Status

This page is the authoritative record of which client integrations have been end-to-end validated and which are still in progress. It's updated whenever a new stack is validated — status markers on `docs/clients/*.md` pages mirror this table.

## What "tested" means here

A stack is marked **Tested** only if *all* of the following are true:

1. The MCP server starts in the client's expected transport mode (stdio or Streamable HTTP).
2. The client's MCP tool picker (or equivalent) lists the Quillmark tools without error.
3. A `create_document` or `compose_document` tool call succeeds and returns `{status: "success", url: …}`.
4. The returned URL resolves to a valid PDF on disk (magic bytes `%PDF`, ≥10 KB, opens in a PDF viewer).
5. Someone wrote the evidence down — commit SHA, test file, or screenshot — so future contributors can reproduce.

"**In Progress**" means the pieces exist (config snippet, doc page, golden fixture test) but nobody has sat down with that specific client and completed steps 1–5 above. The Layer 5 MCP protocol tests in `test/docker/mcp-protocol.test.js` prove the server speaks MCP correctly — they don't prove any specific named client can consume it.

## Matrix

| Stack | Transport | Status | Evidence | Tracking |
|---|---|---|---|---|
| [Claude Code](./clients/claude-code.md) | Streamable HTTP | ✅ **Tested** | `test/docker/mcp-protocol.test.js` Layers 5, 5b, 5b2, 5c | — |
| [Ollama via MCPHost (`qwen3:8b`)](./clients/ollama.md) | HTTP sidecar + compose_document | ✅ **Tested** | `test/docker/mcp-protocol.test.js` Layer 5d + live 135 KB memo render | — |
| [Claude Desktop](./clients/claude-desktop.md) | stdio | ✅ **Tested** | stdio via `docker run -i --rm`; `$HOME` resolution fix in CLI | [#13](https://github.com/nibsbin/quillmark-mcp/issues/13) |
| [Cursor](./clients/cursor.md) | Streamable HTTP | 🚧 In Progress | Config fixture only | *(tracking issue TBD)* |
| [VS Code Copilot Chat](./clients/vscode.md) | Streamable HTTP | 🚧 In Progress | Config fixture only; `servers` key verified in snapshot test | *(tracking issue TBD)* |
| [Cline](./clients/cline.md) | Streamable HTTP | 🚧 In Progress | Config fixture only | *(tracking issue TBD)* |
| [Continue](./clients/continue.md) | Streamable HTTP | 🚧 In Progress | Config fixture only | *(tracking issue TBD)* |
| [Codex CLI](./clients/codex.md) | Streamable HTTP | ✅ **Tested** | Codex CLI v0.120.0 native MCP calls over HTTP; 113 KB PDF produced | [#18](https://github.com/nibsbin/quillmark-mcp/issues/18) |
| [ChatGPT Business+](./clients/chatgpt.md) | Streamable HTTP (cloud) | 🚧 In Progress | Requires publicly reachable HTTPS URL | *(tracking issue TBD)* |
| [OpenAI Responses API (hosted MCP tool)](./clients/openai-api.md) | Streamable HTTP (cloud) | 🚧 In Progress | Requires publicly reachable HTTPS URL | *(tracking issue TBD)* |
| [OpenAI Agents SDK](./clients/openai-api.md) | Streamable HTTP / stdio | 🚧 In Progress | Python code sample generated, never executed | *(tracking issue TBD)* |
| [Ollama via MCPO (Open WebUI)](./clients/ollama.md) | stdio → OpenAPI | 🚧 In Progress | Alt bridge path, not exercised | *(tracking issue TBD)* |
| Ollama + other models (`qwen2.5:7b`, `qwen2.5:14b`, `llama3.1:8b`, `mistral-nemo`, `hermes3`, `granite3.x`, `phi4`) | HTTP sidecar | 🚧 In Progress | Only `qwen3:8b` has been driven through a live render | *(tracking issue TBD)* |

> **Note on `qwen3.5`:** `qwen3.5` is not yet usable via MCPHost on current Ollama releases. Tool-calling is wired to the wrong renderer/parser in Ollama — see [ollama/ollama#14493](https://github.com/ollama/ollama/issues/14493) and [ollama/ollama#14745](https://github.com/ollama/ollama/issues/14745). Use `qwen3:8b` or `qwen2.5:*` instead.

## How to submit a validation

1. Pick a stack from the **In Progress** rows above (or one of the tracking issues labeled `status:needs-validation`).
2. Clone the repo: `git clone https://github.com/nibsbin/quillmark-mcp && cd quillmark-mcp`.
3. Bring the server up in whichever mode the client needs:
   - **HTTP (most clients):** `./scripts/install-mcp.sh`
   - **Ollama sidecar:** `./scripts/install-ollama.sh --yes --no-launch --model qwen3:8b`
4. Follow the client's own setup doc in `docs/clients/<client>.md`. Paste the config snippet, start the client, drive a real `create_document` or `compose_document` call.
5. Confirm a PDF lands in `~/.quillmark/artifacts/` and opens correctly.
6. Record the evidence:
   - Host + Docker versions (`docker --version`, `node --version`)
   - Client version (e.g. `cursor --version`, Cline extension version)
   - Screenshot or terminal log of the tool call succeeding
   - PDF size + first-page rendering (or `pdfinfo` output)
7. Open a PR with:
   - `docs/STATUS.md` updated to flip the row from 🚧 to ✅ with an Evidence column pointing at your PR
   - `docs/clients/<client>.md` status banner flipped to Tested
   - `CHANGELOG.md` `[Unreleased]` section mentioning the newly validated stack
8. Close the tracking issue when the PR merges.

## Why this page exists

The MCP server itself is client-agnostic — any conformant MCP 2.0 client *should* work against it. In practice, every client has its own config file format, authentication quirks, transport preferences, and subtle incompatibilities (VS Code's `servers` vs everyone else's `mcpServers` being the most common footgun). "Should work" and "does work with your exact version" are different claims. This page tracks the second one honestly so nobody is surprised when they try a client that's listed but not verified.

If you validated a stack and didn't open a PR to update this file, your work isn't recorded — and the next contributor will redo it. Please update the matrix.

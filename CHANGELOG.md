# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Codex CLI validated end-to-end.** Codex CLI v0.120.0 connects via Streamable HTTP, calls all three MCP tools natively, and produces a valid 113 KB PDF. Fixed `codex mcp add` syntax in docs (requires `--url` flag). Added gotcha about `--full-auto` sandbox auto-cancelling MCP tool calls.
- **Comprehensive technical documentation.** 18 hand-written GitHub Wiki pages (architecture, CLI, tools, strategies, Docker, testing, security, etc.) + auto-generated TypeDoc API reference site at https://nibsbin.github.io/quillmark-mcp/ with per-module pages, cross-linked navigation, sidebar, full-text search, and dark/light toggle. Landing page shows module index directly. Auto-deploys on push to main.
- **JSDoc annotations on all 32 JS files.** Every source, test, and infrastructure JS file has comprehensive JSDoc comments covering module purpose, exported functions, params, returns, throws, and design rationale.

## [0.1.0] - 2026-04-12

### Added
- **Stateless Streamable HTTP transport.** Switched `McpSdkServerAdapter` to per-request `McpServer` + `StreamableHTTPServerTransport` in stateless mode. Fixes "Server already initialized" on multi-connection clients (Claude Code HTTP, Cursor, etc.).
- **Client-agnostic config snippet generator.** `node src/bin.js config <client>` prints the exact config blob for 12 client targets: `claude-code`, `claude-desktop`, `cursor`, `vscode`, `cline`, `continue`, `codex`, `chatgpt`, `openai-responses`, `openai-agents`, `ollama-mcphost`, `ollama-mcpo`. Pure function, no side effects.
- **`compose_document` tool** for local models. Gated behind `QUILLMARK_LOCAL_MODEL_MODE=1` env var. Accepts structured JSON params (`quill`, `fields`, `body`) instead of raw YAML frontmatter. Server assembles the YAML deterministically so small Ollama models (qwen3:8b, etc.) can chain tool calls without fumbling YAML syntax.
- **`install-ollama.sh` full automation.** Detects Ollama, installs MCPHost (Homebrew / binary / go install), picks or pulls a tool-calling model, starts a dedicated sidecar container (`quillmark-mcp-ollama` on port 8765), writes `~/.mcphost.json`, launches MCPHost with a focused system prompt and `--max-steps 30`.
- **`install-mcp.sh` rewrite.** Now a thin dispatcher: builds image, brings up compose, prints per-client config snippets. No client config files are modified. Supports `--target <client>`, `--mode http|stdio`, `--port`, `--no-server`, `--name`.
- **Per-client walkthrough docs.** 11 files under `docs/clients/` with one-page setup, verify, troubleshoot instructions per target. `docs/clients/index.md` comparison table. `docs/STATUS.md` authoritative validation matrix.
- **Stateless-reconnect regression tests.** Layer 5b2 tests sequential + concurrent MCP clients against the same container. Layer 5d tests the `compose_document` gated tool in local-model mode.
- **Golden-fixture snapshot tests.** `test/cli/config-snapshot.test.js` diffs every generated snippet against committed fixtures. Regenerate with `UPDATE_SNAPSHOTS=1 npm test`.
- **YAML emitter.** `src/primitives/composeYaml.js` — minimal JSON-to-YAML block-style emitter for frontmatter assembly.
- **Quote-stripping in frontmatter parser.** `createDocument.js` now handles YAML-encoded QUILL values (`"usaf_memo@0.2.0"`) that the `composeYaml` emitter produces.
- **GitHub Actions CI.** `ci.yml` runs `npm test` on push/PR; `docker.yml` runs the full six-layer harness on `test:docker` label or main push.
- **Issue templates.** Form-based YAML templates for bug reports, feature requests, and client validation tracking.
- **PR template.** Checklist with test plan, breaking changes, status update reminder.
- **CODEOWNERS, dependabot, .editorconfig, .nvmrc.**
- **CHANGELOG.md** (this file), **CODE_OF_CONDUCT.md**.

### Changed
- `install-mcp.sh` default mode flipped from stdio to HTTP (stateless fix makes HTTP reliable).
- `uninstall-mcp.sh` no longer calls `claude mcp remove` (client-agnostic; users remove their own config entries).
- README rewritten around status matrix (tested vs in-progress) instead of implying all clients are equally supported.
- CONTRIBUTING.md extended with client-validation workflow, sidecar architecture explanation, PR workflow section.

### Fixed
- "Server already initialized" error when Claude Code (or any multi-connection client) reconnects to the HTTP endpoint. Root cause: shared stateful transport across requests. Fix: per-request stateless transport.
- YAML-quoted QUILL refs (e.g. `"usaf_memo@0.2.0"`) now resolve correctly in the lightweight frontmatter parser used by `createDocument`.

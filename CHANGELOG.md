# Changelog

## [Unreleased] - 2026-04-15

Surgical revert to the PROGRAM.md invariant: three primitives, three tools, 1:1.

Dropped `compose_document` (4th tool), `composeYaml` primitive, `QUILLMARK_LOCAL_MODEL_MODE` gate, and 10 non-essential client integrations (claude-desktop, cursor, vscode, cline, continue, chatgpt, openai-*, ollama-*). Also removed TypeDoc-generated wiki docs, auto-docs CI, `scripts/install-ollama.sh`, `CONTRIBUTING.md`, `phases/`, `prose/`, and demo runbook files. Claude Code + Codex CLI remain the only "batteries-included" integrations; other MCP clients connect against the standard HTTP/stdio transports directly.

Kept the post-revert bug fixes that are unrelated to the Docker rewrite: stateless HTTP transport, stderr-only logger, wasm 0.54 schema migration, NYT and CNN news article quills.

## [0.1.0] - 2026-04-12

Initial release. Three MCP tools (`list_quills`, `get_specs`, `create_document`) over stdio + Streamable HTTP. Docker image, one-command install script, Claude Code + Codex client snippets.

# OpenAI Codex CLI

> **Status:** ✅ **Tested** — end-to-end validated with Codex CLI v0.120.0 via Streamable HTTP.
> Codex natively called `list_quills`, `get_specs`, and `create_document` over HTTP, producing a 113 KB PDF.
> Last validated: 2026-04-11. Tracking: [#18](https://github.com/nibsbin/quillmark-mcp/issues/18).

Codex CLI (the `codex` command) is OpenAI's answer to Claude Code. It speaks MCP, supports stdio and Streamable HTTP, and stores config in TOML.

## Prerequisites

- `codex` CLI installed (see [developers.openai.com/codex](https://developers.openai.com/codex/))
- `./scripts/install-mcp.sh` → server on `http://127.0.0.1:8080/mcp`

## Install

Two equivalent options.

### Option A — `codex mcp add` (if available in your version)

```sh
codex mcp add quillmark --url http://127.0.0.1:8080/mcp
```

### Option B — edit config.toml directly

Edit one of:

- `~/.codex/config.toml` (user, all projects)
- `.codex/config.toml` (project, trusted projects only — project entries win on conflict)

Append:

```toml
[mcp_servers.quillmark]
url = "http://127.0.0.1:8080/mcp"
```

Optional fields (all have defaults):

```toml
[mcp_servers.quillmark]
url = "http://127.0.0.1:8080/mcp"
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
# bearer_token_env_var = "QUILLMARK_TOKEN"   # future remote-hosting path
# http_headers = { "X-Custom" = "..." }
```

## Verify

```sh
codex mcp list
codex mcp get quillmark
```

Then run `codex` in a project and ask it to list quills.

## Alternative: stdio (per-session container)

If you'd rather skip compose, use stdio — each Codex session spawns a fresh container:

```toml
[mcp_servers.quillmark]
command = "docker"
args = [
  "run", "-i", "--rm",
  "--user", "10001:10001",
  "--read-only", "--tmpfs", "/tmp",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges:true",
  "-v", "$HOME/.quillmark/artifacts:$HOME/.quillmark/artifacts",
  "-e", "QUILLMARK_OUTPUT_DIR=$HOME/.quillmark/artifacts",
  "-e", "QUILLMARK_BASE_URL=file://",
  "-e", "QUILLMARK_STDIO=1",
  "quillmark-mcp:dev",
  "--stdio"
]
```

Generate this exact block automatically with:

```sh
node src/bin.js config codex --mode stdio
```

## Gotchas

- **Untrusted projects** skip project-scoped TOML. If you edit `.codex/config.toml` and nothing happens, mark the project as trusted first.
- **`codex exec --full-auto` auto-cancels MCP tool calls.** The `--full-auto` sandbox requires explicit approval for MCP tools, which can't be granted in non-interactive mode. Use `--dangerously-bypass-approvals-and-sandbox` if you need unattended `codex exec` with MCP tools. Interactive mode (`codex` without `exec`) prompts normally.
- **Per-tool approval.** Use `[mcp_servers.quillmark.tools.create_document] approval_mode = "approve"` to force a confirmation prompt on each render. Helpful in autonomous agent loops.

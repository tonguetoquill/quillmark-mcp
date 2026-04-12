# Cline (VS Code extension)

> **Status:** 🚧 **In Progress** — config fixture + doc ready, no live Cline session has been driven through the full chain yet.
> Help validate this stack: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issue. <!-- ISSUE:cline -->

Cline is the "open-source autonomous coding agent" VS Code extension. It has first-class MCP support with a UI for managing servers.

## Prerequisites

- VS Code with the Cline extension installed
- `./scripts/install-mcp.sh` → server on `http://127.0.0.1:8080/mcp`

## Install

Easiest path — use Cline's UI:

1. Open Cline → Settings → MCP Servers → **Edit MCP Settings** (opens `cline_mcp_settings.json`).
2. Paste the snippet below into the `mcpServers` object.
3. Save. Cline reloads automatically.

```json
{
  "mcpServers": {
    "quillmark": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

The config file lives in the extension's globalStorage:

- **macOS:** `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Linux/WSL:** `~/.vscode-server/data/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows:** `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

## Verify

In Cline's MCP Servers panel, the `quillmark` entry should show green with three tools listed. Ask in a Cline task:

> List available quills, then render the usaf_memo example.

## Extras

- **`alwaysAllow`** per-tool: add `"alwaysAllow": ["list_quills", "get_specs"]` inside the server entry to skip the per-call approval prompt for safe, read-only tools.
- **`disabled: true`** to keep the entry but stop loading it.

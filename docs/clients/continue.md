# Continue (VS Code / JetBrains)

> **Status:** 🚧 **In Progress** — config fixture + doc ready, no live Continue session has been driven through the full chain yet.
> Help validate this stack: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issue. <!-- ISSUE:continue -->

Continue is an open-source agentic assistant. It supports MCP and accepts drop-in JSON files in a conventional directory, so any snippet that works for Claude Desktop or Cursor works here.

## Prerequisites

- Continue extension installed (VS Code or a JetBrains IDE)
- `./scripts/install-mcp.sh` → server on `http://127.0.0.1:8080/mcp`

## Install

Create `.continue/mcpServers/quillmark.json` at your workspace root:

```json
{
  "mcpServers": {
    "quillmark": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

YAML is also accepted — same keys, drop the file as `.continue/mcpServers/quillmark.yaml`.

## Verify

- Reload Continue (`Developer: Reload Window` in VS Code, or the equivalent in your JetBrains IDE).
- Switch Continue to **Agent** mode.
- Ask: *"List available quills."*

## Gotcha

Continue accepts Claude-Desktop-shaped JSON without the `type` field too — it auto-detects. But being explicit (`"type": "streamable-http"`) avoids ambiguity when you have multiple servers in one file.

# Cursor

> **Status:** 🚧 **In Progress** — config fixture + doc ready, no live Cursor IDE session has been driven through the full chain yet.
> Help validate this stack: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issue. <!-- ISSUE:cursor -->

Cursor speaks MCP over Streamable HTTP and uses the `mcpServers` JSON shape familiar from Claude Desktop.

## Prerequisites

- `./scripts/install-mcp.sh` (or `docker compose up -d`) → server on `http://127.0.0.1:8080/mcp`

## Install

Edit **one** of:

- `.cursor/mcp.json` (project-local, committed or gitignored as you prefer)
- `~/.cursor/mcp.json` (global, applies to all projects)

Paste:

```json
{
  "mcpServers": {
    "quillmark": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

Or use the UI: Cursor → Settings → MCP → "Add New MCP Server" → paste the same JSON.

## Verify

- Restart Cursor (or reload the MCP pane).
- In a chat, enable Agent mode and ask: *"List available quills."*
- Cursor should show the `list_quills` tool call and return the `usaf_memo` entry.

## Gotchas

- **Global tool cap.** Cursor applies a soft cap (~40 tools) across all enabled MCP servers. If you have many MCP servers enabled, tools from later servers may be silently dropped. quillmark-mcp exposes three tools so it won't be the problem — but disable unused servers if you hit the cap.
- **Agent mode only.** MCP tools don't appear in the inline code-complete sidebar. Use the chat panel in Agent mode.

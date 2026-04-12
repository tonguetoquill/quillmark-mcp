# VS Code (GitHub Copilot Chat)

> **Status:** 🚧 **In Progress** — config fixture + doc ready (`servers` key verified via golden snapshot test), no live VS Code Copilot Agent session has been driven through the full chain yet.
> Help validate this stack: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issue. <!-- ISSUE:vscode -->

VS Code Copilot Chat gained native MCP support in v1.102 (July 2025). It speaks Streamable HTTP — but it uses a **different top-level key** than every other client, which is the single most common copy-paste bug in the MCP ecosystem.

> ⚠ VS Code uses `"servers"`. Every other client uses `"mcpServers"`. Pasting a Cursor/Claude snippet verbatim will silently fail.

## Prerequisites

- VS Code 1.102+
- GitHub Copilot or Copilot Chat extension enabled
- `./scripts/install-mcp.sh` → server on `http://127.0.0.1:8080/mcp`

## Install

Create **one** of:

- `.vscode/mcp.json` (workspace-scoped, one entry per repo)
- User profile via `Ctrl/Cmd+Shift+P → MCP: Open User Configuration`

Paste:

```json
{
  "servers": {
    "quillmark": {
      "type": "http",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

## Verify

1. Open the Copilot Chat panel (`Ctrl/Cmd+Alt+I`).
2. Switch the chat mode to **Agent** (top of the panel).
3. Click the tool picker and confirm `quillmark` appears with three tools.
4. Ask: *"List available quills and render the usaf_memo example."*

## Gotchas

- **`servers` vs `mcpServers`.** Called out above. If nothing shows up in the tool picker, this is 99% of the reason.
- **Agent mode only.** Ask/Edit modes ignore MCP tools. If you don't see Agent as an option, your Copilot subscription tier may not include it — check `github.com/features/copilot` for the current matrix.
- **Sandboxing.** VS Code sandboxes MCP servers on macOS/Linux by default. The Docker container already provides its own sandbox; the outer VS Code sandbox just guards the HTTP client.

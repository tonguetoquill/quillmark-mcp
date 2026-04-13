# Claude Desktop

> **Status:** ✅ **Tested** — stdio via `docker run -i --rm`, validated on macOS with Claude Desktop.

Claude Desktop is the only modern MCP client that does **not** accept Streamable HTTP URLs in its JSON config. It supports two paths — neither of which will reach a local Docker container directly unless you use the stdio form below.

**Why:** `claude_desktop_config.json` only accepts `command`/`args`/`env` (stdio). The Settings → Connectors UI does accept HTTP URLs, but those requests are brokered through **Anthropic's cloud** — Anthropic's servers make the outbound HTTPS call, so `localhost:8080` is unreachable. For local dev, the JSON-config + stdio path below is the only option.

## Prerequisites

- Docker Desktop (or Docker Engine) installed and running
- `quillmark-mcp:dev` image built: `./scripts/install-mcp.sh --no-server` (builds the image, skips compose)
- Artifacts directory created: `mkdir -p ~/.quillmark/artifacts`

## Install (recommended)

Generate a ready-to-paste config with all paths resolved for your machine:

```sh
node src/bin.js config claude-desktop
```

Copy the JSON output into the config file for your OS:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Replace the whole file if it's empty, or merge the `quillmark` entry into your existing `mcpServers` object.

## Install (manual)

If you prefer to paste the JSON manually, edit the config file and use this template — **replacing `/Users/you`** with your actual home path:

```json
{
  "mcpServers": {
    "quillmark": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--user", "10001:10001",
        "--read-only", "--tmpfs", "/tmp",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "-v", "/Users/you/.quillmark/artifacts:/Users/you/.quillmark/artifacts",
        "-e", "QUILLMARK_OUTPUT_DIR=/Users/you/.quillmark/artifacts",
        "-e", "QUILLMARK_BASE_URL=file://",
        "-e", "QUILLMARK_STDIO=1",
        "quillmark-mcp:dev",
        "--stdio"
      ]
    }
  }
}
```

> **Claude Desktop does not expand shell variables.** Do not use `$HOME` or `~` in the args — use the full absolute path (e.g. `/Users/alice` on macOS, `C:\\Users\\alice` on Windows). The recommended install method above handles this automatically.

## Restart

Fully quit and relaunch Claude Desktop — it only reads the config file on startup.

## Verify

In Claude Desktop, open any conversation and look at the bottom-left hammer icon. It should show `quillmark` with three tools. Ask:

> List available quills, then render the usaf_memo example.

The returned `file://` URL points to a real file on disk (because of the matching-path bind mount).

## Why not the Connectors UI?

Claude Desktop's Settings → Connectors → Add custom connector flow accepts HTTPS URLs, but all such requests are proxied through Anthropic's cloud. Since Anthropic's servers cannot reach `127.0.0.1`, a local Docker container is unreachable that way. To make the native Connectors UI work you would need to expose the server publicly (HTTPS, domain, auth) — which is an out-of-scope remote-hosting story. For local dev the stdio form above is the pragmatic choice.

## WSL note

If you run Claude Desktop on Windows but want Docker Desktop on Windows with the container pulling quills from WSL, the `$HOME` path in the args needs to be the Windows-side path (e.g. `C:\\Users\\you\\.quillmark\\artifacts`), and the volume mount Docker Desktop understands will translate it. Don't mix WSL paths and Windows paths in the same args list.

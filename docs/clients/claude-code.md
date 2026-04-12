# Claude Code

> **Status:** ✅ **Tested** — end-to-end validated with a real rendered document.
> Evidence: `test/docker/mcp-protocol.test.js` Layers 5, 5b, 5b2, 5c (18 passing assertions) + live stdio + HTTP smoke tests in the repo history. See [`docs/STATUS.md`](../STATUS.md).

Claude Code is Anthropic's CLI. It speaks MCP natively, supports Streamable HTTP, and is the fastest client to wire up.

## Prerequisites

- `docker compose up -d` (run from the repo root, or via `./scripts/install-mcp.sh`) — server on `http://127.0.0.1:8080/mcp`
- `claude` CLI on `PATH`

## Install

One command:

```sh
claude mcp add --transport http quillmark http://127.0.0.1:8080/mcp
```

> **`--transport http` is required.** Without it, Claude Code defaults to stdio and tries to execute the URL as a shell command. If you see `Warning: looks like a URL, but is being interpreted as a stdio server`, re-run with the flag.

Scopes (`--scope` flag, optional):

- `local` (default) — this project, your user only. Stored in `~/.claude.json`.
- `project` — committed to `.mcp.json` at the repo root for team sharing.
- `user` — your user, all projects. Stored in `~/.claude.json`.

## Verify

```sh
claude mcp list | grep quillmark
claude mcp get quillmark
```

Then open Claude Code and ask:

> List available quills, then render the usaf_memo example.

Expect a `file://` or `http://` URL pointing to a PDF under `~/.quillmark/artifacts/`.

## Alternative: stdio (per-session container)

Useful if you'd rather skip the compose stack and let Claude Code spawn a fresh container per session. Generate the exact command with:

```sh
node src/bin.js config claude-code --mode stdio
```

Paste the printed `claude mcp add quillmark -- docker run ...` command into your shell.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Warning: looks like a URL, but is being interpreted as a stdio server` | You forgot `--transport http`. Run: `claude mcp remove quillmark && claude mcp add --transport http quillmark http://127.0.0.1:8080/mcp` |
| `MCP error: Not Found` | Wrong URL — the endpoint is `/mcp`, not `/`. |
| `Server already initialized` | Outdated server image. Rebuild: `docker rmi quillmark-mcp:dev && ./scripts/install-mcp.sh`. The stateless fix landed in the same refactor that added this doc. |
| Tool calls return `errors:[{message: "quill not found"}]` | Your frontmatter is missing `QUILL: <name>`. Run `get_specs` first. |

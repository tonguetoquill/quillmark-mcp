# quillmark-mcp

MCP server and composable primitives for [Quillmark](https://quillmark.readthedocs.io/en/latest/) — schematized document rendering for LLM consumers.

## Requirements

- Node.js ≥ 24 (for local dev or the `npx` path)
- Docker + Docker Compose plugin (for the one-command install below)
- Claude Code CLI (optional — the install script registers the server if it's on `PATH`)

## Quick start — one-command Docker install

Clone this repo, then:

```sh
./scripts/install-mcp.sh
# (open Claude Code, ask it to list quills or render a memo)
./scripts/uninstall-mcp.sh
```

That's it. Behind the scenes the install script:

1. Builds `quillmark-mcp:dev` if it isn't already cached
2. Runs `docker compose up -d` (container bound to `127.0.0.1:8080`)
3. Clears any poisoned Claude Code OAuth cache entry for this server ([fix for anthropics/claude-code#34008](https://github.com/anthropics/claude-code/issues/34008))
4. Runs `claude mcp add --transport http quillmark http://127.0.0.1:8080/mcp`
5. Prints verification commands + teardown instructions

**Custom port** (if `8080` is busy):

```sh
./scripts/install-mcp.sh --port 9090
```

**Round-trip test** (install → exercise tools → uninstall, on a test port):

```sh
npm run test:install
```

**Future compose expansion.** Adding a sidecar (a worker, a queue, a reverse proxy, a DB) is just another service block in `docker-compose.yml`. The install command stays the same: `docker compose up -d`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Claude Code shows `quillmark - authenticate (MCP)` | `npm run claude:reset && npm run install:mcp` — re-runs the cache surgery and fresh registration. |
| `Port 8080 is already allocated` | `./scripts/install-mcp.sh --port 9090` (or any other free port). |
| Artifact URL returns 404 or mentions `0.0.0.0` | Confirm `docker compose logs quillmark-mcp` shows `QUILLMARK_BASE_URL=http://127.0.0.1:…/artifacts` — the compose file sets this explicitly. |
| `docker: command not found` | Install Docker Desktop ≥ 4.62 (or Docker Engine + compose plugin on Linux). |

### Alternative: Docker MCP Toolkit

If you prefer the Docker Desktop MCP Toolkit UI (custom catalog, Gateway-brokered connections, `docker mcp` CLI plugin), see the [official docs](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/). The install script above gives the same outcome and works on any Docker setup (Docker Desktop, Docker CE, Linux), so it's the recommended default.

## Install (npm)

```sh
npm install quillmark-mcp
```

## Usage

### Use with Claude Code

Start the server, then register it with Claude Code over streamable HTTP:

```sh
# 1. Start the server (binds to http://localhost:8080/mcp by default)
npx quillmark-mcp

# 2. Register it with Claude Code
claude mcp add --transport http quillmark http://localhost:8080/mcp
```

Customize the bind address with `--bind {host}:{port}` and `--endpoint`. Pass
`--stdio` to switch to MCP stdio transport (for clients that pipe directly).
All CLI flags also accept `QUILLMARK_*` environment-variable fallbacks
(`QUILLMARK_BIND`, `QUILLMARK_ENDPOINT`, `QUILLMARK_QUILLS_DIR`,
`QUILLMARK_OUTPUT_DIR`, `QUILLMARK_BASE_URL`, `QUILLMARK_STDIO=1`) — CLI wins
over env, env wins over defaults.

### Docker (local dev)

> **Status:** local-only. No image is published to a registry yet — you build
> it yourself. There is no CI pipeline; run the deep-layered test harness on
> your laptop.

Build:

```sh
npm run docker:build        # docker build -t quillmark-mcp:dev .
```

Run (streamable HTTP on `127.0.0.1:8080`):

```sh
docker run --rm -it \
  --user 10001:10001 --read-only --tmpfs /tmp \
  --cap-drop=ALL --security-opt=no-new-privileges:true \
  -p 127.0.0.1:8080:8080 \
  -v quillmark-artifacts:/data/artifacts \
  quillmark-mcp:dev
```

Register with Claude Code (HTTP transport):

```sh
claude mcp add --transport http quillmark http://127.0.0.1:8080/mcp
```

Or, for Claude Desktop stdio bridge, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quillmark": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--user", "10001:10001",
        "-v", "quillmark-artifacts:/data/artifacts",
        "quillmark-mcp:dev",
        "--stdio"
      ]
    }
  }
}
```

Run the deep test harness (six layers: lint, unit, build, container black-box,
MCP protocol compliance, PDF fidelity + stress):

```sh
npm run test:docker         # runs scripts/docker-test.sh end-to-end
```

The harness handles its own cleanup (containers, volumes) and auto-skips
optional tooling (`hadolint`, `dockle`, `trivy`, `docker scout`) when not
installed.

### Plug-and-play MCP server (library)

```js
import { createDefaultMCP, PassThroughStrategy } from 'quillmark-mcp';

const strategy = new PassThroughStrategy(async (quill, content) => {
  // deliver content to your service, return { status, url?, errors? }
  return { status: 'ok', url: 'https://example.com/doc/123' };
});

const mcp = createDefaultMCP({ quillsDir: './quills', strategy });
await mcp.start({
  transportType: 'httpStream',
  httpStream: { host: 'localhost', port: 8080, endpoint: '/mcp' },
});
```

### Custom MCP server

`QuillmarkMCP` is the base class: it takes a pre-built `{ registry, strategy, server }` and registers Quillmark tools on the server. Use it when you need to swap the registry, server, or add your own tools.

See [`src/mcp/createDefaultMCP.js`](src/mcp/createDefaultMCP.js) for the reference wiring — copy it as a starting point and replace pieces as needed.

### Composable primitives

```js
import { listQuills, getSpecs, createDocument } from 'quillmark-mcp/primitives';
import { PassThroughStrategy } from 'quillmark-mcp/strategies';
import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

init();
const registry = new QuillRegistry({
  source: new FileSystemSource('./quills'),
  engine: new Quillmark(),
});

const quills = await listQuills(registry);
const specs = await getSpecs(registry, 'usaf_memo');
const result = await createDocument(registry, strategy, content);
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_quills` | List available quills with names and descriptions |
| `get_specs` | Get TOON-encoded schema and authoring instructions for a quill |
| `create_document` | Create a document from Quillmark content (YAML frontmatter + markdown body) |

`create_document` expects content with a `QUILL:` field in YAML frontmatter. If missing, it returns a structured error for agent self-repair.

## Delivery Strategies

| Strategy | Behavior |
|----------|----------|
| `PassThroughStrategy` | Delegates to a provided handler function |
| `RenderAndHostStrategy` | Renders via `@quillmark/wasm`, serves artifact, returns download URL |

To implement a custom strategy, extend `DeliveryStrategy` and implement `handle(quill, validatedContent)`.

## License

Apache 2.0

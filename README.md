# quillmark-mcp

An MCP server and composable primitives for [Quillmark](https://quillmark.readthedocs.io/en/latest/) — schematized document rendering for LLM consumers. Ships a containerized one-command install for Claude Code, a host-native library path for custom pipelines, and a deep-layered local test harness.

- **Renders** Typst-based document templates ("quills") via `@quillmark/wasm` — no native `typst` binary, no system fonts, everything in a single WASM module.
- **Delivers** rendered artifacts via a pluggable `DeliveryStrategy` (the default writes to disk and returns a `file://` or `http://` URL).
- **Exposes** three MCP tools (`list_quills`, `get_specs`, `create_document`) that work with any MCP-compliant client — Claude Code, Claude Desktop, MCP Inspector, Cursor, custom SDK clients.
- **Ships** a locked-down multi-stage Docker image (non-root uid 10001, read-only FS, tini, healthcheck) and a six-layer host-side validation harness (~76 assertions).

---

## Quick start — one command install

Clone the repo and run:

```sh
./scripts/install-mcp.sh
# open Claude Code, ask it to render a memo
./scripts/uninstall-mcp.sh
```

The install script builds the image if needed, creates `~/.quillmark/artifacts`, and registers quillmark with Claude Code as a **stdio-bridge**: each Claude Code session spawns a fresh container via `docker run -i --rm … --stdio`, with the artifacts directory bind-mounted at the same absolute path on both sides so `file://` URLs resolve on the host.

**Requirements**

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 24 | Engines field; ESM + `node --test` + built-in `fetch` |
| Docker | any modern release | Builds + runs the image |
| Docker Compose plugin | any | `--http` mode + `npm run test:docker` layer 4 |
| Claude Code CLI | optional | The install script registers the server automatically if it's on `PATH` |

---

## How it works — the stack

```
 ┌─────────────────────┐     stdio or HTTP      ┌─────────────────────────┐
 │  MCP client         │ ──────────────────────▶│  @modelcontextprotocol  │
 │  (Claude Code,      │   JSON-RPC 2.0 /       │  /sdk ^1.29             │
 │   Inspector, SDK)   │   Streamable HTTP      │  server side            │
 └─────────────────────┘                        └────────────┬────────────┘
                                                             │ adapter
                                                             ▼
                                          ┌────────────────────────────────┐
                                          │  src/mcp/McpSdkServerAdapter  │
                                          │  — HTTP router + stdio dispatch│
                                          │  — artifact static file server │
                                          │  — JSON 404 on unknown paths   │
                                          └────────────┬───────────────────┘
                                                       │ registers tools
                                                       ▼
                                          ┌────────────────────────────────┐
                                          │  src/mcp/QuillmarkMCP         │
                                          │  — glue: registry + strategy   │
                                          │    + server, nothing else      │
                                          └────────────┬───────────────────┘
                                                       │ calls primitives
                                                       ▼
                             ┌──────────────────────────────────────────────┐
                             │   src/primitives/                           │
                             │    listQuills(registry)                      │
                             │    getSpecs(registry, ref)                   │
                             │    createDocument(registry, strategy, body)  │
                             └────────────┬─────────────────────────────────┘
                                          │ validates, resolves, delegates
                                          ▼
                        ┌─────────────────────────────────────────────────────┐
                        │  DeliveryStrategy (abstract)                        │
                        │   ↳ RenderAndHostStrategy (default)                 │
                        │       — @quillmark/wasm render → bytes              │
                        │       — write to outputDir                          │
                        │       — return { status, url }                      │
                        └─────────────────────────────────────────────────────┘
```

### Key pieces

| Layer | Code | Notes |
|---|---|---|
| **Engine** | `@quillmark/wasm` 0.51.1 | Compiled WASM module. Parses markdown, renders Typst, emits PDF/SVG/TXT bytes. No native binary. |
| **Registry** | `@quillmark/registry` 0.12 | `FileSystemSource` reads `quills/<name>/<version>/Quill.yaml` and packs each quill's files. |
| **Primitives** | `src/primitives/*` | Pure functions. No internal state. Dependencies (registry, strategy) passed as arguments. |
| **Strategy** | `src/strategies/RenderAndHostStrategy.js` | Rendering is a strategy side-effect. Core path is validate-then-delegate. |
| **MCP glue** | `src/mcp/QuillmarkMCP.js` | Registers the three primitives as MCP tools on an adapter. No additional behavior. |
| **Adapter** | `src/mcp/McpSdkServerAdapter.js` | Thin adapter around `@modelcontextprotocol/sdk` — routes HTTP requests, serves artifacts, handles stdio. |
| **Entry** | `src/bin.js` | CLI + env-var fallbacks. Parses flags, constructs the strategy, starts the transport. |
| **Schema encoding** | `@toon-format/toon` | `get_specs` returns TOON-encoded JSON Schema (token-efficient for LLMs). |

### Runtime flow — what happens when Claude asks for a memo

1. Claude Code spawns `docker run -i --rm … quillmark-mcp:dev --stdio` (per the stdio-bridge registration).
2. Inside the container, `src/bin.js` reads `QUILLMARK_*` env vars, resolves paths, creates a `RenderAndHostStrategy`, calls `createDefaultMCP(...)` to wire up the registry + adapter, and starts the stdio transport.
3. `createDefaultMCP` eagerly loads the quill manifest from `quillsDir` and pre-resolves every quill (WASM init is not cheap — we pay it once).
4. Claude Code's MCP SDK sends `initialize` → `tools/list` → `tools/call create_document`.
5. `createDocument` (the primitive) validates the YAML frontmatter, resolves the quill by reference, runs a dry-render to catch schema errors, then calls `strategy.handle(quill, content)`.
6. `RenderAndHostStrategy.handle` runs `Quillmark.parseMarkdown` + `engine.render`, writes the resulting bytes to `outputDir`, and returns `{ status: 'success', url: 'file:///Users/you/.quillmark/artifacts/<uuid>.pdf' }`.
7. Because the container bind-mounts `~/.quillmark/artifacts` at the same host path, the `file://` URL opens directly on macOS/Linux.

### Transports — stdio vs HTTP

Both are supported but they're **not interchangeable** for Claude Code:

| Mode | When to use | Works with Claude Code? |
|---|---|---|
| **stdio** (default) | Claude Code, Claude Desktop, Inspector, SDK clients | **Yes** — fresh container per session |
| **HTTP (Streamable)** | curl, Inspector's HTTP mode, custom integrations | **No** — Claude Code opens multiple connections and the upstream `StreamableHTTPServerTransport` only accepts one `initialize` handshake per container lifetime, so the second connection gets `Invalid Request: Server already initialized`. |

HTTP mode is still available via `./scripts/install-mcp.sh --http` for curl and Inspector workflows; it's just not the way to wire up Claude Code against this server today.

### Artifact URL strategies

`RenderAndHostStrategy` picks its URL shape from `baseUrl`:

| `baseUrl` | Example returned URL | When |
|---|---|---|
| `file://` (literal) | `file:///Users/you/.quillmark/artifacts/usaf_memo-<uuid>.pdf` | Default for stdio — combined with a matching-path bind mount, the URL works on both container and host. |
| `http://127.0.0.1:8080/artifacts` | `http://127.0.0.1:8080/artifacts/usaf_memo-<uuid>.pdf` | HTTP mode — the adapter's built-in artifact server handles the download. |
| Custom (`https://cdn.example.com/docs`) | `https://cdn.example.com/docs/<uuid>.pdf` | Remote hosting — you point `QUILLMARK_BASE_URL` at your CDN and ship the bytes there out of band. |

---

## MCP tools

Registered in `src/mcp/QuillmarkMCP.js`. Schemas are Zod objects; descriptions are verbatim from the source.

| Tool | Args | Returns | Errors |
|---|---|---|---|
| `list_quills` | (none) | `[{ name, description }, ...]` | Never throws — returns `[]` on internal failure |
| `get_specs` | `ref: string` | `{ schema: <TOON string>, instructions: string }` | Throws if the quill reference is unknown |
| `create_document` | `content: string` — YAML frontmatter + markdown, with a `QUILL:` field in frontmatter | `{ status, url?, errors? }` | Returns a structured `{ status: 'error', errors: [...] }` on validation failure (not a protocol error) so the agent can self-repair |

**Static vs dynamic instructions** — tool descriptions are baked into the server (static; they teach the agent how to call the tool). Per-quill authoring guidance comes from the quill itself via `@quillmark/wasm` and is returned by `get_specs` alongside the schema. Boundary: **quillmark-mcp owns tool-usage guidance; quills own content-authoring guidance.**

---

## Installation paths

### 1. One-command Docker install (recommended for Claude Code)

```sh
./scripts/install-mcp.sh
```

Registers Claude Code to spawn a fresh container per session using `claude mcp add quillmark -- docker run -i --rm … --stdio`. Uses the matching-path volume trick so artifacts land in `~/.quillmark/artifacts/` on the host.

**Tear down:**

```sh
./scripts/uninstall-mcp.sh                 # deregister only
./scripts/uninstall-mcp.sh --yes --purge   # also remove image + host artifacts dir
```

**Advanced flags:**

```sh
./scripts/install-mcp.sh --http              # HTTP + compose mode (Inspector/curl only)
./scripts/install-mcp.sh --http --port 9090  # custom host port
./scripts/install-mcp.sh --no-claude         # skip Claude Code registration
```

### 2. npm (library mode)

```sh
npm install quillmark-mcp
```

Use it from your own code:

```js
import { createDefaultMCP } from 'quillmark-mcp';
import { RenderAndHostStrategy } from 'quillmark-mcp/strategies';

const strategy = new RenderAndHostStrategy({
  outputDir: './artifacts',
  baseUrl: 'file://',
});
const mcp = await createDefaultMCP({ quillsDir: './quills', strategy });
await mcp.start({ transportType: 'stdio' });
```

Or use the primitives directly for custom orchestration (LangChain agents, pipelines):

```js
import { listQuills, getSpecs, createDocument } from 'quillmark-mcp/primitives';
import { RenderAndHostStrategy } from 'quillmark-mcp/strategies';
import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

init();
const registry = new QuillRegistry({
  source: new FileSystemSource('./quills'),
  engine: new Quillmark(),
});

const quills = await listQuills(registry);
const specs  = await getSpecs(registry, 'usaf_memo');
const result = await createDocument(registry, new RenderAndHostStrategy(), content);
```

### 3. Raw CLI (no Docker)

```sh
npx quillmark-mcp --bind 127.0.0.1:8080         # HTTP mode
npx quillmark-mcp --stdio                         # stdio mode
```

All CLI flags accept `QUILLMARK_*` env-var fallbacks (CLI wins over env wins over defaults):

| Flag | Env | Default |
|---|---|---|
| `--quills-dir` | `QUILLMARK_QUILLS_DIR` | `./quills` |
| `--output-dir` | `QUILLMARK_OUTPUT_DIR` | `.artifacts` |
| `--base-url` | `QUILLMARK_BASE_URL` | derived from bind |
| `--bind` | `QUILLMARK_BIND` | `localhost:8080` |
| `--endpoint` | `QUILLMARK_ENDPOINT` | `/mcp` |
| `--stdio` | `QUILLMARK_STDIO=1` | off |

---

## Building

### Docker image

```sh
npm run docker:build
# docker build -t quillmark-mcp:dev .
```

The Dockerfile is a three-stage build on `node:24-slim`:

1. **`deps`** — `npm ci --omit=dev --ignore-scripts` with a BuildKit cache mount for `~/.npm`
2. **`test`** — full `npm ci` + `node --test test/`. The image fails to build if unit tests fail.
3. **`runtime`** — `node:24-slim` + `tini` (via apt), non-root user `quill` uid 10001, `COPY --chown` of `node_modules`, `src/`, `quills/`, and `docker/healthcheck.js`. `ENTRYPOINT ["/usr/bin/tini", "--", "node", "src/bin.js"]`.

Final image is ~296 MB, 22 layers, enforced by the test harness. See `Dockerfile` and `.dockerignore` for the specifics.

### Image composition (what ships in the runtime stage)

```
/app/
├── node_modules/            # production deps only
├── package.json             # for runtime version reads
├── src/                     # the server
├── quills/                  # bundled USAF memo template (fonts + typst sources)
└── docker/healthcheck.js    # Node-based HTTP healthcheck

/data/artifacts/             # VOLUME — where rendered PDFs land
```

### Host-only build for development

```sh
npm install
npm start                      # defaults to streamable HTTP on localhost:8080
# or
node src/bin.js --stdio         # stdio transport
```

---

## Testing

Five layers of testing are wired up, each with a clear purpose:

| Command | Scope | Speed | When to run |
|---|---|---|---|
| `npm test` | Unit tests via `node:test` against source on host | ~300ms | Every edit |
| `npm run test:docker` | Full six-layer validation of the built image (see below) | 60–90s warm, ~4min cold | Before committing |
| `npm run test:install` | Round-trip install → exercise tools → uninstall (HTTP mode, alt port 18080) | ~30s | Before releasing the install script |
| `./scripts/install-mcp.sh && <stdio smoke>` | End-to-end stdio pipeline from a fake MCP client (see `CONTRIBUTING.md`) | ~5s | Before trying in Claude Code |
| Claude Code interactively | The only test that catches UX regressions | manual | Whenever you change tool descriptions or install flows |

### The six-layer docker harness

`scripts/docker-test.sh` runs these in order, fails fast:

| Layer | What | Assertions |
|---|---|---|
| 1 | `npm audit` + optional `hadolint` / `shellcheck` (auto-skip if not installed) | High+ vulnerabilities fail |
| 2 | Host unit tests (`npm test`) | 40 assertions, all pass |
| 3 | Docker build + size budget (≤ 450 MB) + layer count sanity | Image built, budget met |
| 4 | Container black-box — `test/docker/container.test.js` | 9 assertions: healthcheck, non-root uid, tini PID 1, SIGTERM ≤ 5s, volume persistence, path-traversal rejection, env override |
| 5 | MCP protocol compliance — `test/docker/mcp-protocol.test.js` | 13 assertions across HTTP transport + stdio transport + low-level JSON-RPC plumbing |
| 6 | PDF fidelity — `test/docker/pdf-validation.test.js` | 10 assertions: magic bytes, EOF, page/font refs, determinism, 10-render memory stress, malformed-input recovery |
| 6b | Optional Trivy / Docker Scout scans | Best-effort, warns-only |

Each test file guards itself with `DOCKER_TEST=1` (the harness sets it) so a plain `npm test` skips them cleanly without starting Docker.

### Install round-trip

`scripts/test-mcp-install.sh` runs on port 18080 (never collides with a real `:8080` stack) and:

1. Runs `./scripts/install-mcp.sh --http --port 18080 --no-claude`
2. Confirms `docker compose ps` shows `quillmark-mcp` healthy
3. Runs `test/docker/install.test.js` (gated by `DOCKER_INSTALL_TEST=1`) — asserts tools list, renders a real memo, fetches and validates the PDF bytes, checks the artifact URL uses `127.0.0.1` (not `0.0.0.0`)
4. Runs `./scripts/uninstall-mcp.sh --yes`
5. Confirms no residue

```sh
npm run test:install
```

---

## Delivery strategies

| Strategy | Exported from | Behavior |
|---|---|---|
| `DeliveryStrategy` | `src/strategies/DeliveryStrategy.js` | Abstract base — throws on `handle()`. Extend it to add your own. |
| `RenderAndHostStrategy` | `src/strategies/RenderAndHostStrategy.js` | The default. Initializes `@quillmark/wasm`, renders on each `handle()` call, writes bytes to `outputDir`, returns a URL (shape determined by `baseUrl`). |

**To write your own**, subclass `DeliveryStrategy`:

```js
import { DeliveryStrategy } from 'quillmark-mcp/strategies';

class S3Strategy extends DeliveryStrategy {
  constructor({ bucket }) { super(); this.bucket = bucket; }
  async handle(quill, validatedContent) {
    // render however you like — or POST content upstream unchanged
    return { status: 'success', url: 'https://…' };
    // or: return { status: 'error', errors: [{ message: '…' }] };
  }
}
```

Pass your strategy into `createDefaultMCP({ quillsDir, strategy: new S3Strategy({ bucket: '…' }) })`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Claude Code shows `quillmark - authenticate (MCP)` or `Failed to connect` | You're registered in HTTP mode (known-broken with Claude Code). Run `./scripts/uninstall-mcp.sh --yes && ./scripts/install-mcp.sh` to switch back to stdio. |
| `Server already initialized` (`-32600`) when POSTing to `/mcp` | HTTP mode limitation — the server only accepts one initialize per container lifetime. Use stdio for real client work. |
| Artifact `file://` URL points to a file that doesn't exist on the host | The install script's matching-path volume mount needs `~/.quillmark/artifacts` on both sides. Confirm with `ls -la ~/.quillmark/artifacts/` after a render. |
| `docker: command not found` | Install Docker Desktop or Docker Engine + compose plugin. |
| `Port 8080 is already allocated` (HTTP mode) | `./scripts/install-mcp.sh --http --port 9090` |
| Rebuild not picking up code changes | `docker rmi quillmark-mcp:dev && ./scripts/install-mcp.sh` — forces a fresh build. |

**Alternative: Docker MCP Toolkit.** If you prefer the Docker Desktop MCP Toolkit UI (`docker mcp catalog`, Gateway-brokered connections), see the [official docs](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/). Our install script gives the same outcome and works on any Docker setup.

---

## Repository layout

```
quillmark-mcp/
├── src/
│   ├── bin.js                    # CLI entry point
│   ├── index.js                  # npm package root export
│   ├── logger.js                 # loglevel wrapper (stderr-only)
│   ├── mcp/
│   │   ├── createDefaultMCP.js   # engine + registry + adapter + QuillmarkMCP wiring
│   │   ├── McpSdkServerAdapter.js  # HTTP router + artifact server + stdio dispatch
│   │   └── QuillmarkMCP.js        # registers the three primitives as MCP tools
│   ├── primitives/
│   │   ├── listQuills.js
│   │   ├── getSpecs.js            # JSON Schema → TOON encoding
│   │   └── createDocument.js      # validate → resolve → strategy.handle
│   └── strategies/
│       ├── DeliveryStrategy.js    # abstract base
│       └── RenderAndHostStrategy.js
│
├── quills/                        # bundled template library
│   └── usaf_memo/0.2.0/           # USAF AFH 33-337 memorandum template
│       ├── Quill.yaml             # schema + metadata
│       ├── example.md             # fixture used by tests
│       └── packages/…/            # Typst sources + embedded fonts
│
├── test/
│   ├── bin.test.js, integration.test.js, smoke.test.js
│   ├── mcp/, primitives/, strategies/   # host unit tests
│   ├── docker/
│   │   ├── helpers.js             # shared docker-run helpers
│   │   ├── container.test.js      # Layer 4 — black-box container
│   │   ├── mcp-protocol.test.js   # Layer 5 — MCP protocol compliance
│   │   ├── pdf-validation.test.js # Layer 6 — PDF fidelity + stress
│   │   └── install.test.js        # install round-trip
│   └── fixtures/quills/           # test quill used by unit tests
│
├── scripts/
│   ├── install-mcp.sh             # one-command stdio-bridge install
│   ├── uninstall-mcp.sh           # one-command takedown
│   ├── claude-reset.sh            # clear poisoned mcpOAuth cache (issue #34008)
│   ├── docker-test.sh             # six-layer validation harness
│   └── test-mcp-install.sh        # install round-trip test
│
├── docker/healthcheck.js          # node-based HTTP healthcheck
├── Dockerfile                     # multi-stage node:24-slim
├── docker-compose.yml             # HTTP mode + forward-compat comments
├── .dockerignore
├── CONTRIBUTING.md                # how to work on this repo
├── PROGRAM.md                     # design philosophy + agent journeys
└── README.md                      # you are here
```

---

## Philosophy

- **Less is more.** Tool descriptions are minimal and semantically dense. Consumers needing richer context layer it above.
- **Composable.** The MCP server is plug-and-play, but the primitives are independently usable — for LangChain agents, custom pipelines, etc. A future library split stays clean.
- **Stateless and idempotent.** Every tool call is a fresh document. No edit/patch/session semantics.
- **Security by default.** The image runs as non-root uid 10001, with a read-only root filesystem, no capabilities, `no-new-privileges`, and a 512 MB / 1 CPU / 256 PID cap in compose.

---

## License

Apache 2.0 (see `LICENSE`).

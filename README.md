# quillmark-mcp

[![CI](https://github.com/nibsbin/quillmark-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/nibsbin/quillmark-mcp/actions/workflows/ci.yml)
[![Node 24+](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](./.nvmrc)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Status matrix](https://img.shields.io/badge/validation-see%20STATUS.md-yellow)](./docs/STATUS.md)

An MCP server for [Quillmark](https://quillmark.readthedocs.io/en/latest/) — schematized document rendering for any LLM, any model, any app. One Docker container, a snippet generator that prints copy-paste configs for every major MCP client, and an automated Ollama-via-MCPHost path for local models.

- **Renders** Typst-based document templates ("quills") via `@quillmark/wasm` — no native `typst` binary, no system fonts, everything in a single WASM module.
- **Delivers** rendered artifacts via a pluggable `DeliveryStrategy` (the default writes to disk and returns a `file://` or `http://` URL).
- **Exposes** 3 MCP tools by default (`list_quills`, `get_specs`, `create_document`) and a 4th (`compose_document`) in local-model mode for clients whose models can't reliably produce raw YAML.
- **Ships** a locked-down multi-stage Docker image (non-root uid 10001, read-only FS, tini, healthcheck) and a six-layer host-side validation harness (91 unit tests, 18 Docker MCP protocol tests, 10 PDF fidelity tests).
- **Prints** per-client config snippets via `node src/bin.js config <client>` — zero file I/O into your IDE/CLI settings; you paste yourself.

> **⚠ Validation status is not uniform across clients.** Two stacks are empirically validated end-to-end (Claude Code + Ollama via MCPHost with `qwen3:8b`). The rest have docs and config snippets but no live client verification yet. See [`docs/STATUS.md`](./docs/STATUS.md) for the authoritative matrix and how to help validate the in-progress ones.

---

## Quick start — one command install

```sh
./scripts/install-mcp.sh
# → HTTP server running at http://127.0.0.1:8080/mcp
# → prints a config snippet for every supported client
```

Then pick your client and paste the snippet:

| Client | Transport | Status | Doc |
|---|---|---|---|
| **Claude Code** | Streamable HTTP | ✅ Tested | [docs/clients/claude-code.md](./docs/clients/claude-code.md) |
| **Ollama via MCPHost** (`qwen3:8b`) | HTTP sidecar + compose_document | ✅ Tested | [docs/clients/ollama.md](./docs/clients/ollama.md) — automated via `./scripts/install-ollama.sh` |
| Claude Desktop | stdio (via `mcp-remote`) | 🚧 In progress | [docs/clients/claude-desktop.md](./docs/clients/claude-desktop.md) |
| Cursor | Streamable HTTP | 🚧 In progress | [docs/clients/cursor.md](./docs/clients/cursor.md) |
| VS Code Copilot Chat | Streamable HTTP | 🚧 In progress | [docs/clients/vscode.md](./docs/clients/vscode.md) — ⚠ `servers` key, not `mcpServers` |
| Cline | Streamable HTTP | 🚧 In progress | [docs/clients/cline.md](./docs/clients/cline.md) |
| Continue | Streamable HTTP | 🚧 In progress | [docs/clients/continue.md](./docs/clients/continue.md) |
| Codex CLI | HTTP / stdio | 🚧 In progress | [docs/clients/codex.md](./docs/clients/codex.md) |
| ChatGPT Business+ | Streamable HTTP (cloud) | 🚧 In progress | [docs/clients/chatgpt.md](./docs/clients/chatgpt.md) — requires public HTTPS URL |
| OpenAI Responses API + Agents SDK | Streamable HTTP | 🚧 In progress | [docs/clients/openai-api.md](./docs/clients/openai-api.md) |
| Ollama via MCPO (Open WebUI) | stdio → OpenAPI | 🚧 In progress | [docs/clients/ollama.md](./docs/clients/ollama.md) |

For a side-by-side comparison and setup tips, see [`docs/clients/index.md`](./docs/clients/index.md). To help validate an in-progress stack, see [`docs/STATUS.md`](./docs/STATUS.md).

Tear down:

```sh
./scripts/uninstall-mcp.sh --yes           # stop + remove containers
./scripts/uninstall-mcp.sh --yes --purge   # also remove image + host artifacts dir
```

**Requirements**

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 24 | Engines field; ESM + `node --test` + built-in `fetch` |
| Docker | any modern release | Builds + runs the image |
| Docker Compose plugin | any | Default HTTP deployment + `npm run test:docker` layer 4 |
| Client CLI (`claude`, `codex`, etc.) | optional | Only needed if you want to use that client's own `mcp add` command instead of pasting into config files |

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

Both are supported and both work with multi-connection clients. Streamable HTTP runs in **stateless mode** (`sessionIdGenerator: undefined` per SDK 1.29 semantics) with a fresh `McpServer` + transport per request, so concurrent clients and reconnects never collide.

| Mode | When to use | Supported clients |
|---|---|---|
| **HTTP (Streamable)** — default | `docker compose up -d` → one long-running container on `127.0.0.1:8080/mcp`. Every HTTP-capable client hits the same endpoint. | Claude Code, Cursor, VS Code Copilot, Cline, Continue, Codex CLI, ChatGPT Business+ (via public tunnel), OpenAI Responses/Agents SDK, Ollama via MCPHost |
| **stdio** — per-session | Each client session spawns a fresh `docker run -i --rm … --stdio` container. No long-running process. | Claude Desktop (JSON config accepts only stdio), Ollama via MCPO bridge |

The snippet generator (`node src/bin.js config <client>`) knows which mode each client needs and fills in the right shape.

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

### 1. One-command Docker install (recommended)

```sh
./scripts/install-mcp.sh
```

Builds the image, brings up the HTTP server (`docker compose up -d`), creates `~/.quillmark/artifacts/`, and prints a copy-paste config snippet for every supported client. No user config files are modified — you paste into whichever client you use.

**Flags:**

```sh
./scripts/install-mcp.sh --target claude-code       # print only one client's snippet
./scripts/install-mcp.sh --mode stdio               # skip compose; per-session container model
./scripts/install-mcp.sh --port 9090                # custom host port
./scripts/install-mcp.sh --no-server                # just build the image and print snippets
./scripts/install-mcp.sh --name quillmark-dev       # override the server name in snippets
```

**Per-client docs:** [`docs/clients/`](./docs/clients/index.md) — one file per target with the exact snippet, verification steps, and troubleshooting.

**Snippet generator on its own:**

```sh
node src/bin.js config <client> [--mode http|stdio] [--url URL] [--name NAME]
# clients: claude-code, claude-desktop, cursor, vscode, cline, continue,
#          codex, chatgpt, openai-responses, openai-agents,
#          ollama-mcphost, ollama-mcpo
```

Pure function — no file writes, deterministic output, covered by golden-fixture tests.

**Tear down:**

```sh
./scripts/uninstall-mcp.sh --yes           # stop compose stack
./scripts/uninstall-mcp.sh --yes --purge   # also drop image + volume + host artifacts dir
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
| `MCP error: Not Found` in any client | Wrong URL — the endpoint is `/mcp`, not `/`. Use `http://127.0.0.1:8080/mcp`. |
| `Server already initialized` when POSTing to `/mcp` | Stale image. Rebuild: `docker rmi quillmark-mcp:dev && ./scripts/install-mcp.sh`. The stateless-HTTP fix is in SDK-compatible images only (see `src/mcp/McpSdkServerAdapter.js`). |
| Client tool-picker shows no quillmark tools | Config pasted into the wrong key. VS Code uses `servers`; everyone else uses `mcpServers`. Double-check against the client-specific doc. |
| Artifact `file://` URL points to a file that doesn't exist on the host (stdio mode) | The matching-path volume mount needs `$HOME/.quillmark/artifacts` on both sides. Confirm with `ls -la ~/.quillmark/artifacts/` after a render. |
| `docker: command not found` | Install Docker Desktop or Docker Engine + compose plugin. |
| `Port 8080 is already allocated` | `./scripts/install-mcp.sh --port 9090` (or edit `docker-compose.override.yml`). |
| Rebuild not picking up code changes | `docker rmi quillmark-mcp:dev && ./scripts/install-mcp.sh`. |
| ChatGPT / Responses API hosted MCP can't reach the server | Those paths run in OpenAI's cloud and cannot reach `127.0.0.1`. Expose the server via Cloudflare Tunnel / Tailscale Funnel / ngrok and use the public URL. |

**Alternative: Docker MCP Toolkit.** If you prefer the Docker Desktop MCP Toolkit UI (`docker mcp catalog`, Gateway-brokered connections), see the [official docs](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/). Our install script works standalone on any Docker setup; a future PR will add an `mcp/quillmark` entry to the Docker MCP registry for one-click Toolkit installs.

---

## Repository layout

```
quillmark-mcp/
├── src/
│   ├── bin.js                    # CLI entry point (incl. `config <client>` subcommand)
│   ├── index.js                  # npm package root export
│   ├── logger.js                 # loglevel wrapper (stderr-only)
│   ├── cli/
│   │   └── config.js              # client-agnostic snippet generator (pure function)
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
├── docs/
│   └── clients/                   # per-client walkthroughs (one .md per target)
│       ├── index.md               # comparison table + 30-second setup
│       ├── claude-code.md
│       ├── claude-desktop.md
│       ├── cursor.md
│       ├── vscode.md
│       ├── cline.md
│       ├── continue.md
│       ├── codex.md
│       ├── chatgpt.md
│       ├── openai-api.md
│       └── ollama.md
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
│   ├── cli/
│   │   └── config-snapshot.test.js  # golden fixtures for every client × mode
│   ├── docker/
│   │   ├── helpers.js             # shared docker-run helpers
│   │   ├── container.test.js      # Layer 4 — black-box container
│   │   ├── mcp-protocol.test.js   # Layer 5 — MCP protocol + stateless reconnect
│   │   ├── pdf-validation.test.js # Layer 6 — PDF fidelity + stress
│   │   └── install.test.js        # install round-trip
│   └── fixtures/
│       ├── configs/               # golden snippets (one per client/mode)
│       └── quills/                # test quill used by unit tests
│
├── scripts/
│   ├── install-mcp.sh             # build image + bring up server + print client snippets
│   ├── install-ollama.sh          # fully-automated Ollama + MCPHost + Quillmark setup
│   ├── uninstall-mcp.sh           # stop compose + optional purge
│   ├── claude-reset.sh            # (legacy) clear poisoned mcpOAuth cache
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

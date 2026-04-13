# Testing

Complete reference for the quillmark-mcp test architecture. Covers the host test suite, the 6-layer Docker harness, snapshot patterns, test doubles, and gating conventions.

## Overview

**91 host tests + 33 Docker tests = 124 total** across **14 test files**.

All tests use the Node.js built-in test runner (`node --test`). No Jest, Mocha, or other frameworks. The test suite runs in ~300ms on the host; the Docker harness takes 60-90s warm.

```
test/
  smoke.test.js                      # canary: node:test runner works
  bin.test.js                        # CLI entry point: args, env vars, transport selection
  integration.test.js                # cold-start journey: listQuills -> getSpecs -> createDocument
  primitives/
    listQuills.test.js               # quill listing + projection + error resilience
    getSpecs.test.js                 # spec retrieval + schema stripping
    createDocument.test.js           # document creation + validation + error paths
    composeYaml.test.js              # YAML assembly from structured fields
  strategies/
    RenderAndHostStrategy.test.js    # strategy options, defaults, render errors
  mcp/
    QuillmarkMCP.test.js             # tool registration, execution, lifecycle
  cli/
    config-snapshot.test.js          # golden fixture snapshots for config snippets
  docker/
    container.test.js                # Layer 4: container black-box
    mcp-protocol.test.js             # Layer 5: MCP protocol compliance
    pdf-validation.test.js           # Layer 6: PDF fidelity + stress
    install.test.js                  # install round-trip validation
```

## Which Tests to Run

| You edited... | Run these |
|---|---|
| `src/primitives/*` | `npm test` |
| `src/strategies/*` | `npm test` |
| `src/cli/config.js` (snippet generator) | `npm test` -- when intentional, re-seed with `UPDATE_SNAPSHOTS=1 npm test` and review the fixture diff |
| `src/mcp/QuillmarkMCP.js` (tool registration) | `npm test` + `npm run test:docker` (Layer 5) |
| `src/mcp/McpSdkServerAdapter.js` (HTTP routing, JSON 404, stateless transport) | `npm run test:docker` (Layers 4 + 5) |
| `src/bin.js` (CLI, env vars, transports, `config` subcommand) | `npm test` + manual stdio smoke |
| `Dockerfile` or `.dockerignore` | `npm run test:docker` (all 6 layers) |
| `docker-compose.yml` | `npm run test:install` |
| `scripts/install-mcp.sh` / `uninstall-mcp.sh` | Manual: uninstall -> install -> smoke -> uninstall |
| `scripts/docker-test.sh` | `npm run test:docker` |
| `quills/**` or adding a new quill | `npm test` + manual end-to-end render in any client |
| `docs/clients/**` | Eyes-only + sanity check one snippet against your target client |
| Docs (`README.md`, `CONTRIBUTING.md`, `PROGRAM.md`) | Eyes-only |

## 6-Layer Docker Harness

**File**: `scripts/docker-test.sh` (also: `npm run test:docker`)

The harness runs all six layers in sequence. Layers 1-3 are shell-driven; Layers 4-6 use `node --test` against live containers. A cleanup trap removes all test containers and volumes on exit.

### Layer 1: Lint + Audit

```sh
hadolint Dockerfile              # Dockerfile linting (if installed)
shellcheck scripts/docker-test.sh # shell script linting (if installed)
npm audit --audit-level=high      # dependency vulnerability scan
```

All Layer 1 checks are best-effort: missing tools are warned, not fatal.

### Layer 2: Host Unit Tests

```sh
npm test
```

Runs all 91 host unit tests. Hermetic -- strips any `QUILLMARK_*` env vars inherited from the shell before running. Failure here aborts the entire harness.

### Layer 3: Docker Build + Size Budget

```sh
docker build -t quillmark-mcp:dev .
```

After building, enforces:

| Check | Threshold | Failure behavior |
|---|---|---|
| Image size | 450 MB | Hard fail |
| Layer count | 25 | Warning |
| CIS benchmark (dockle) | Warn-level | Warning (if dockle installed) |

### Layer 4: Container Black-Box

**File**: `test/docker/container.test.js`

Spins up live containers and validates them as opaque units. Tests:

| Test | What it validates |
|---|---|
| Container reports healthy | Docker state is "running" after HTTP readiness |
| Non-root uid 10001 | `id -u` inside container returns `10001` |
| `/mcp` endpoint responds | GET returns 2xx-4xx (not 5xx), proving transport is wired |
| JSON 404 shape | Unknown paths return `{"error":"not_found"}` with `application/json` |
| SIGTERM graceful shutdown | tini forwards SIGTERM; container exits within 5s with code 0 or 143 |
| Custom QUILLMARK_ENDPOINT | Container with `/custom/mcp` responds on that path; default `/mcp` returns 404 |
| Artifact persistence | PDF survives container restart when the same volume is reattached |
| Path traversal rejection | `../../etc/passwd` on `/artifacts/` returns 400/403/404 |
| tini as PID 1 | `/proc/1/comm` inside the container matches `tini` |

### Layer 5: MCP Protocol Compliance

**File**: `test/docker/mcp-protocol.test.js`

Uses the official MCP SDK `Client` as the test driver. Validates the full MCP lifecycle, not just HTTP 200s.

**Layer 5 (HTTP transport)**:

| Test | What it validates |
|---|---|
| Initialize handshake | Server advertises `tools` capability |
| Server identity | Reports name + version |
| tools/list | Returns exactly `list_quills`, `get_specs`, `create_document` (3 tools) |
| list_quills | Returns all bundled quills (`usaf_memo`, `static_analysis_report`, `nyt_news_article`, `cnn_news_article`) |
| get_specs | Returns TOON spec + instructions for `usaf_memo` |
| create_document (valid) | Returns `{status: "success", url: ".../artifacts/<id>.pdf"}` |
| create_document (no QUILL) | Returns `{status: "error", errors: [...]}` mentioning "quill" |
| create_document (unknown quill) | Returns structured error with errors array |
| get_specs (unknown ref) | Surfaces protocol error (isError: true) |

**Layer 5b (low-level HTTP plumbing)** -- raw `fetch`, no SDK:

| Test | What it validates |
|---|---|
| Initialize returns JSON | Content-Type is `application/json`, not SSE |
| Missing Accept header | POST without `Accept` header is rejected with 4xx |

**Layer 5b2 (stateless reconnect)**:

| Test | What it validates |
|---|---|
| Sequential clients | Two independent clients can both initialize and list tools |
| Concurrent clients | Two simultaneous clients share the same container without collision |

**Layer 5c (stdio transport)**:

| Test | What it validates |
|---|---|
| Same 3 tools via stdio | `docker run -i --rm` with `--stdio` exposes identical tool surface |
| list_quills via stdio | Can call tools over stdio transport |

**Layer 5d (local-model mode)**:

Starts a container with `QUILLMARK_LOCAL_MODEL_MODE=1`.

| Test | What it validates |
|---|---|
| 4-tool surface | `compose_document` appears alongside the base 3 tools |
| compose_document renders | Structured fields + body produce a valid PDF URL |
| Validation errors | Incomplete fields return `{status: "error", errors: [...]}` |

### Layer 6: PDF Fidelity + Rendering Stress

**File**: `test/docker/pdf-validation.test.js`

Validates structural correctness, determinism, and memory stability of rendered PDFs.

| Test | What it validates |
|---|---|
| `%PDF-` magic bytes | First 5 bytes match ISO 32000 magic |
| `%%EOF` marker | Trailer present in last 1024 bytes |
| Non-trivial size | PDF > 10 KB (catches empty/error stubs) |
| PDF version header | Matches `%PDF-1.x` |
| `/Type /Page` object | At least one page object exists in the binary |
| `/Type /Font` object | At least one font is embedded (catches missing bundled fonts) |
| No `/JavaScript` actions | Safety: no executable content in the PDF |
| Deterministic rendering | Two renders of identical input produce bytewise-identical output (or differ < 256 bytes) |
| Memory stability | 10 sequential renders all succeed; memory growth stays under 200 MiB |
| Crash recovery | Malformed YAML does not kill the container; subsequent valid render succeeds |

### Layer 6b: Security Scans (best-effort)

```sh
trivy image --severity CRITICAL quillmark-mcp:dev    # if installed
docker scout cves --only-severity critical            # if available
```

## Golden Fixture Snapshot Pattern

**File**: `test/cli/config-snapshot.test.js`

The snippet generator (`src/cli/config.js`) emits config blocks for every `(client, mode)` pair. Each output is diffed byte-for-byte against a committed fixture file in `test/fixtures/configs/`.

### Convention

| Format | Fixture extension | Example |
|---|---|---|
| JSON | `.json` | `claude-desktop-stdio.json` |
| TOML | `.toml` | `codex-http.toml` |
| YAML | `.yaml` | |
| Text | `.txt` | `chatgpt-http.txt` |
| Shell | `.sh.snap` | |
| JavaScript | `.js.snap` | |
| Python | `.py.snap` | |

The `.snap` suffix prevents Node's `--test` runner from accidentally executing fixture files.

### Regeneration

```sh
UPDATE_SNAPSHOTS=1 npm test
```

When `UPDATE_SNAPSHOTS=1` is set, mismatches overwrite the fixture on disk instead of failing. Review the diff, then commit. Without the env var, any drift from the committed fixture fails the test.

### Supplementary assertions

Beyond snapshot matching, the test suite also:

- Parses JSON snippets to prove syntactic validity
- Asserts client-specific key contracts: Claude Desktop uses `mcpServers` (not `servers`); VS Code uses `servers` (not `mcpServers`)
- Validates `authToken` threading into HTTP snippets as `Authorization: Bearer <token>`
- Confirms `--name` and `--url` overrides propagate correctly

## Test Doubles

The test suite uses three in-memory test doubles defined in `test/mcp/QuillmarkMCP.test.js` and `test/bin.test.js`. No mocking framework is used -- all doubles are plain classes/objects.

### FakeServer

```js
class FakeServer {
  constructor() {
    this.tools = [];
    this.startOptions = undefined;
  }
  addTool(tool) { this.tools.push(tool); }
  async start(options) { this.startOptions = options; }
  async stop() {}
}
```

Records registered tools and start options without performing I/O. Used by `QuillmarkMCP.test.js` to assert tool registration metadata, parameter schemas, and execution delegation without a real MCP server.

### FakeRegistry

```js
class FakeRegistry {
  constructor() {
    this.available = [];
    this.resolvedRefs = [];
    this.engine = {
      getStrippedSchema: () => ({ type: 'object', properties: {} }),
      getQuillInfo: () => ({ example: 'Write like this.' }),
      dryRun: () => {},
    };
  }
  async getAvailableQuills() { return this.available; }
  async resolve(ref) { this.resolvedRefs.push(ref); return { name: ref }; }
}
```

Returns canned quill metadata and tracks resolved refs for assertion. The `engine` property stubs out the WASM-backed methods (`getStrippedSchema`, `getQuillInfo`, `dryRun`) so tests run without initializing the real WASM module.

### FakeStrategy

Used in `bin.test.js` as an inline class:

```js
class FakeStrategy {
  constructor(options) { strategyOptions = options; }
}
```

Captures constructor args into a closure variable for later assertion. Validates that `main()` wires `--output-dir` and `--base-url` into the strategy correctly.

All three doubles follow the same pattern: implement the interface the production code expects, capture calls for assertion, return canned data. No spy/stub library overhead.

## Docker Test Gating

All Docker test files use the same gating pattern:

```js
import { SHOULD_RUN } from './helpers.js';

const maybe = SHOULD_RUN ? describe : describe.skip;

maybe('Layer N: ...', () => { ... });
```

The gate is defined in `test/docker/helpers.js`:

```js
export const SHOULD_RUN = process.env.DOCKER_TEST === '1';
```

When `DOCKER_TEST` is not set to `'1'`, every Docker suite is silently skipped via `describe.skip`. This lets the full test matrix declare Docker suites unconditionally while remaining safe in environments without Docker.

The install round-trip tests (`test/docker/install.test.js`) use a separate gate:

```js
const SHOULD_RUN = process.env.DOCKER_INSTALL_TEST === '1';
```

This is set by `scripts/test-mcp-install.sh`, which wraps the install lifecycle.

### How Docker tests get enabled

| Command | What it sets |
|---|---|
| `npm run test:docker` | Runs `scripts/docker-test.sh`, which sets `DOCKER_TEST=1` |
| `npm run test:install` | Runs `scripts/test-mcp-install.sh`, which sets `DOCKER_INSTALL_TEST=1` |
| `npm test` | Neither env var is set; Docker suites are skipped |

## Key Test Files Reference

| File | Tests | Layer | What it covers |
|---|---|---|---|
| `test/smoke.test.js` | 1 | Host | Canary: node:test runner works |
| `test/bin.test.js` | 12 | Host | CLI args, env vars, transport selection, `config` subcommand |
| `test/integration.test.js` | 4 | Host | Cold-start journey, error paths, factory wiring, package exports |
| `test/primitives/listQuills.test.js` | 4 | Host | Quill listing, projection, empty/error registry |
| `test/primitives/getSpecs.test.js` | 4 | Host | Spec retrieval, schema stripping |
| `test/primitives/createDocument.test.js` | 8 | Host | Document creation, validation, QUILL resolution, error paths |
| `test/primitives/composeYaml.test.js` | 16 | Host | YAML assembly from structured fields (compose_document path) |
| `test/strategies/RenderAndHostStrategy.test.js` | 4 | Host | Strategy options, defaults, render error propagation |
| `test/mcp/QuillmarkMCP.test.js` | 13 | Host | Tool registration, parameter schemas, execution, lifecycle |
| `test/cli/config-snapshot.test.js` | 12+ | Host | Golden snapshots for all (client, mode) pairs + structural assertions |
| `test/docker/container.test.js` | 10 | 4 | Health, security posture, HTTP transport, shutdown, persistence |
| `test/docker/mcp-protocol.test.js` | 18 | 5/5b/5c/5d | MCP protocol, HTTP plumbing, stdio, local-model mode |
| `test/docker/pdf-validation.test.js` | 11 | 6 | PDF structure, determinism, memory stability, crash recovery |
| `test/docker/install.test.js` | 4 | Install | Round-trip: handshake, tools, artifact URL, OAuth probe |

The `config-snapshot.test.js` count is dynamic -- it generates one `it()` per supported `(client, mode)` pair, plus static structural assertions. The "12+" reflects the baseline static tests; the actual count grows as clients are added.

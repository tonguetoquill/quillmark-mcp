# Package and Exports

How the `quillmark-mcp` npm package is structured, what it publishes, and the CI/CD pipelines that guard it.

---

## npm package surface

### Export map

| Specifier | Entry point | Symbols |
|---|---|---|
| `"."` | `src/index.js` | `createDefaultMCP`, `DeliveryStrategy` |
| `"./primitives"` | `src/primitives/index.js` | `listQuills`, `getSpecs`, `createDocument` |
| `"./strategies"` | `src/strategies/index.js` | `DeliveryStrategy`, `RenderAndHostStrategy` |
| `"./mcp"` | `src/mcp/index.js` | `QuillmarkMCP`, `createDefaultMCP` |

```js
// Root import — most consumers only need this
import { createDefaultMCP, DeliveryStrategy } from 'quillmark-mcp';

// Granular imports
import { listQuills, getSpecs, createDocument } from 'quillmark-mcp/primitives';
import { RenderAndHostStrategy }                 from 'quillmark-mcp/strategies';
import { QuillmarkMCP }                          from 'quillmark-mcp/mcp';
```

### Binary

```jsonc
// package.json
"bin": {
  "quillmark-mcp": "./src/bin.js"
}
```

After `npm install -g quillmark-mcp` (or via `npx`), the `quillmark-mcp` command is available. It supports three execution paths:

1. **Server start** (default) -- resolves quills, builds a `RenderAndHostStrategy`, starts MCP over stdio or streamable HTTP.
2. **`config <client>`** -- emits a client-specific configuration snippet (Claude Desktop, VS Code, etc.).
3. **`mcphost-config`** -- emits a pure JSON blob for `~/.mcphost.json` (consumed by `scripts/install-ollama.sh`).

### Published files

```jsonc
"files": [
  "src/",
  "quills/"
]
```

Only `src/` (source) and `quills/` (built-in quill templates) ship in the tarball. Tests, scripts, Docker files, and docs are excluded.

---

## Dependencies

### Production (5)

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP protocol server implementation (stdio + streamable HTTP transports) |
| `@quillmark/registry` | Quill template discovery and schema resolution |
| `@quillmark/wasm` | WASM rendering engine for document generation |
| `@toon-format/toon` | TOON format parser/serializer used by the rendering pipeline |
| `loglevel` | Lightweight logger with level filtering |

### Development (1)

| Package | Purpose |
|---|---|
| `jsdoc-to-markdown` | Generates `docs/wiki/API-Reference.md` from JSDoc annotations |

---

## npm scripts

| Script | Command | What it does |
|---|---|---|
| `test` | `node --test` | Run host unit tests (Node.js built-in test runner) |
| `test:docker` | `./scripts/docker-test.sh` | Six-layer Docker test harness (build, boot, probe, tools, artifacts, security) |
| `test:install` | `./scripts/test-mcp-install.sh` | Verify MCP installation scripts work end-to-end |
| `start` | `node src/bin.js` | Start the server (defaults to streamable HTTP on `localhost:8080`) |
| `install:mcp` | `./scripts/install-mcp.sh` | Register quillmark-mcp with Claude Code (stdio-bridge mode) |
| `install:ollama` | `./scripts/install-ollama.sh` | Register with mcphost for local Ollama models |
| `docs:api` | `jsdoc2md --files 'src/**/*.js' --configure jsdoc.json > docs/wiki/API-Reference.md` | Regenerate API reference from JSDoc |
| `docker:build` | `docker build -t quillmark-mcp:dev .` | Build local Docker image |
| `docker:run` | `docker run --rm -it ...` | Run hardened container (read-only, non-root, cap-drop ALL) |
| `release:patch` | `npm version patch` | Bump patch version, `preversion` runs tests, `postversion` pushes tags |
| `release:minor` | `npm version minor` | Bump minor version |
| `release:major` | `npm version major` | Bump major version |
| `prerelease` | `npm version prerelease --preid beta && npm publish --tag beta` | Publish beta pre-release to npm |

The `preversion` hook runs `npm test` before any version bump. The `postversion` hook runs `git push --follow-tags` to push the version commit and tag in one shot.

---

## CI/CD workflows

### ci.yml -- Host unit tests

**Triggers:** push to `main`, pull requests targeting `main`

Runs `npm test` on Node 24 (from `.nvmrc`). Includes a golden-file drift check that fails CI if snapshot fixtures are stale.

```
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### docker.yml -- Docker test harness

**Triggers:** push to `main`, pull requests with the `test:docker` label

The full six-layer harness is expensive (60-90s warm, ~4 min cold), so it only runs automatically on main pushes. Contributors opt in by adding the `test:docker` label to their PR.

A `should-run` gate job checks the trigger conditions before the actual test job runs `npm run test:docker` with Docker Buildx.

### wiki.yml -- Wiki auto-publish

**Trigger:** push to `main`

Regenerates the API reference (`npm run docs:api`) and publishes all wiki pages to the GitHub wiki. Keeps the wiki in sync with the `docs/wiki/` directory automatically.

---

## GitHub automation

### CODEOWNERS

All paths require review from `@ark-232`. Key areas with explicit rules:

| Path pattern | Rationale |
|---|---|
| `/src/mcp/`, `/src/primitives/`, `/src/strategies/` | Server core -- rendering path changes need owner review |
| `/test/`, `/scripts/` | Test harness and fixtures affect CI |
| `/Dockerfile`, `/docker-compose.yml`, `/docker/` | Security-sensitive deployment surface |
| `/.github/` | DevOps infrastructure |
| `SECURITY.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` | Policy files |

### Dependabot

Three ecosystems, all on a weekly Monday schedule (`06:00 America/Anchorage`):

| Ecosystem | Grouping strategy |
|---|---|
| **npm** | Minor + patch batched into one PR; majors surfaced individually |
| **github-actions** | All update types batched into one PR |
| **docker** | Base image updates (e.g. `node:24-slim`) |

All PRs are labeled `dependencies` + `area:devops`. Commit messages use `chore(deps)`, `chore(actions)`, or `chore(docker)` prefixes.

### Issue templates

| Template | Labels | Purpose |
|---|---|---|
| Bug report | `bug` | Requires tested stack, minimal repro, environment info |
| Feature request | `enhancement` | Problem statement + proposed solution + area dropdown |
| Client validation | `status:needs-validation`, `area:client-integration`, `help wanted` | Track end-to-end validation of a specific MCP client |

Blank issues are disabled. The config also links to Security Advisories, `docs/STATUS.md`, and per-client setup docs.

### PR template

Structured sections: Summary, What changed, Why, Test plan (with checkboxes for host tests, Docker harness, live smoke test), Breaking changes, Related, and a contributor checklist.

---

## Conventions

### .editorconfig

```ini
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab

[*.{sh,bash}]
indent_style = space
indent_size = 2
```

### .nvmrc

```
24
```

The project requires Node.js >= 24.0.0 (`engines` field in `package.json`). CI reads `.nvmrc` via `setup-node`'s `node-version-file` option.

---

## Logger

All logging goes to **stderr only**. Stdout is reserved exclusively for the stdio JSON-RPC wire protocol -- any stray stdout output would corrupt the transport.

The logger wraps `loglevel` with a custom method factory that prepends ISO timestamps and uppercased severity:

```
[2026-04-11T12:00:00.000Z] INFO Server started
[2026-04-11T12:00:00.001Z] DEBUG {"reqId":"abc"} Handling request
```

Control verbosity with the `LOG_LEVEL` environment variable:

| Value | Effect |
|---|---|
| `trace` | Everything |
| `debug` | Debug and above |
| `info` | Default -- normal operation messages |
| `warn` | Warnings and errors only |
| `error` | Errors only |
| `silent` | No output |

```bash
LOG_LEVEL=debug npm start
```

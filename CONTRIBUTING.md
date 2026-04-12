# Contributing

This guide covers getting a dev environment up, running the right tests for the right change, and the rules of the road when editing this codebase. For the *what* and the *why* — stack, runtime flow, transports, delivery strategies, tool schemas — read `README.md` first. This doc assumes you already did.

## Setup

```sh
git clone https://github.com/nibsbin/quillmark-mcp.git
cd quillmark-mcp
npm install
```

Requirements: **Node.js ≥ 24**, Docker with the compose plugin (for the Docker layers of testing). No other native toolchain — `@quillmark/wasm` is a prebuilt WASM module, so there's nothing to compile.

Sanity-check the install:

```sh
npm test                           # 40 unit tests should pass in < 1s
```

## The dev loop

There are two ways to iterate, depending on what you're touching.

### Host-native (fastest — for primitives, strategies, MCP tool glue)

Edit code, re-run `npm test`. The whole unit suite runs in ~300ms and covers the primitives, strategies, MCP adapter, and CLI arg parsing. No Docker needed.

```sh
npm test                           # one-shot
node --test --watch                # re-runs on every save (Node 20+)
```

For an end-to-end check without Claude Code in the loop, start the server directly on the host:

```sh
node src/bin.js --stdio &          # stdio against your edited source
# …then drive it from an MCP client or an SDK script
```

### Docker-native (for install flow, image, healthchecks, transport layers)

Any time you touch the `Dockerfile`, `docker-compose.yml`, the install/uninstall scripts, `docker/healthcheck.js`, or the `test/docker/*` suite, rebuild the image and re-run the harness.

```sh
npm run docker:build               # docker build -t quillmark-mcp:dev .
npm run test:docker                # six-layer harness, 60-90s warm
```

### Testing a full install end-to-end

```sh
./scripts/install-mcp.sh           # registers with Claude Code via stdio-bridge
# … try it in Claude Code …
./scripts/uninstall-mcp.sh
```

For an automated round-trip (install on port 18080, exercise tools, uninstall, verify no residue):

```sh
npm run test:install
```

If Claude Code misbehaves after you've been flipping modes, clear the poisoned OAuth cache and reinstall:

```sh
npm run claude:reset               # removes quillmark from ~/.claude/.credentials.json
./scripts/install-mcp.sh
```

## Project structure

See `README.md` → "Repository layout" for the full tree. The short version:

```
src/
  bin.js            # CLI + env-var fallbacks + signal routing + `config <client>` subcommand
  cli/config.js     # client-agnostic snippet generator (pure function)
  primitives/       # pure functions — no internal state
  strategies/       # DeliveryStrategy (abstract) + RenderAndHostStrategy
  mcp/              # McpSdkServerAdapter + QuillmarkMCP + createDefaultMCP
test/
  *.test.js               # host unit tests
  cli/*.test.js           # snippet generator goldens
  docker/*.test.js        # docker-gated via DOCKER_TEST=1 (or DOCKER_INSTALL_TEST=1)
  fixtures/configs/       # golden config snippets (one per client/mode)
docs/
  clients/                # one markdown walkthrough per supported client
scripts/
  *.sh                    # install, uninstall, test harnesses
Dockerfile, docker-compose.yml, .dockerignore
```

### Adding a new MCP client target

1. Add an entry to `SUPPORTED` in `src/cli/config.js` with the supported mode(s).
2. Add a templating function for it (e.g. `function newClient(ctx) {...}`) and wire it into the switch in `generateConfig`.
3. Run `UPDATE_SNAPSHOTS=1 npm test` to seed the golden fixture under `test/fixtures/configs/<client>-<mode>.<ext>`. Review the diff.
4. Add a walkthrough doc at `docs/clients/<client>.md`. Keep it under ~60 lines: what you get, install, verify, gotchas.
5. Link it from `docs/clients/index.md` and the per-client list in `README.md`.

The snippet generator is the source of truth; the doc's snippet block should come straight from `node src/bin.js config <client>`. Don't hand-copy strings — they'll drift.

## Which tests to run for which change

| You edited… | Run these |
|---|---|
| `src/primitives/*` | `npm test` |
| `src/strategies/*` | `npm test` |
| `src/cli/config.js` (snippet generator) | `npm test` — when intentional, re-seed with `UPDATE_SNAPSHOTS=1 npm test` and review the fixture diff |
| `src/mcp/QuillmarkMCP.js` (tool registration) | `npm test` + `npm run test:docker` (Layer 5) |
| `src/mcp/McpSdkServerAdapter.js` (HTTP routing, JSON 404, stateless transport) | `npm run test:docker` (Layers 4 + 5) |
| `src/bin.js` (CLI, env vars, transports, `config` subcommand) | `npm test` + manual stdio smoke |
| `Dockerfile` or `.dockerignore` | `npm run test:docker` (all 6 layers) |
| `docker-compose.yml` | `npm run test:install` |
| `scripts/install-mcp.sh` / `uninstall-mcp.sh` | Manual: uninstall → install → smoke → uninstall |
| `scripts/docker-test.sh` | `npm run test:docker` |
| `quills/**` or adding a new quill | `npm test` + manual end-to-end render in any client |
| `docs/clients/**` | Eyes-only + sanity check one snippet against your target client |
| Docs (`README.md`, `CONTRIBUTING.md`, `PROGRAM.md`) | Eyes-only |

## Stdio smoke test (the debug anchor)

If something breaks and you're not sure if the bug is in your server or in Claude Code, run this from the repo root. It spawns a fresh container, connects via stdio, lists tools, renders the bundled USAF memo, and confirms the PDF exists on disk:

```js
// save as /tmp/quillmark-smoke.mjs and run from the repo:
//   node --input-type=module -e "$(cat /tmp/quillmark-smoke.mjs)"
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const artifactsDir = `${process.env.HOME}/.quillmark/artifacts`;
const transport = new StdioClientTransport({
  command: 'docker',
  args: [
    'run', '-i', '--rm',
    '--user', '10001:10001',
    '--read-only', '--tmpfs', '/tmp',
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '-v', `${artifactsDir}:${artifactsDir}`,
    '-e', `QUILLMARK_OUTPUT_DIR=${artifactsDir}`,
    '-e', 'QUILLMARK_BASE_URL=file://',
    '-e', 'QUILLMARK_STDIO=1',
    'quillmark-mcp:dev',
    '--stdio',
  ],
});
const client = new Client({ name: 'smoke', version: '0.0.1' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log('✓ tools:', tools.map(t => t.name).join(', '));
const memo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');
const result = await client.callTool({ name: 'create_document', arguments: { content: memo } });
const body = result.structuredContent ?? JSON.parse(result.content[0].text);
console.log('✓ url:', body.url);
const filePath = body.url.replace(/^file:\/\//, '');
if (!existsSync(filePath)) throw new Error(`PDF not at ${filePath}`);
console.log('✓ file on disk:', statSync(filePath).size, 'bytes');
await client.close();
```

If the smoke passes, the server works and any issue is in the client. If it fails, the server or the image is broken — check `docker compose logs` or rerun with `LOG_LEVEL=debug`.

## Code guidelines

- **Primitives stay pure.** No internal state. Dependencies (registry, strategy) are passed as arguments. Tests use the same call shape as production code.
- **The MCP layer is sugar, not a separate abstraction.** If you need to do something in `QuillmarkMCP.js` that couldn't reasonably live in a primitive, stop and reconsider.
- **Delivery strategy is the only public extension point.** Source adapters, validation, TOON formatting, and transport routing are internal concerns — don't expose them.
- **Logs go to stderr.** `src/logger.js` enforces this because stdio mode uses stdout for the JSON-RPC wire protocol — a stray `console.log` corrupts the stream. Don't add direct `console.log` calls; use the logger.
- **Tests live next to the code they test.** `src/primitives/listQuills.js` ↔ `test/primitives/listQuills.test.js`. Docker-layer tests live under `test/docker/`.
- **Write tests where they provide clear value.** Don't over-invest in infrastructure ahead of a stabilized design. The existing suite is the bar — mirror its style.
- **No new runtime dependencies without a conversation.** The dep tree is deliberately small (5 prod deps). Adding a native module would break the WASM-only build story.

## Image and security invariants

If you touch the Dockerfile, these must still hold after your change:

- Base is `node:<version>-slim` (not Alpine — some SDK transitive deps need glibc).
- Three stages: `deps` (prod deps only), `test` (runs `node --test`), `runtime` (final).
- User is `quill:quill` with uid/gid `10001:10001`. Never run as root.
- `tini` is PID 1 (`ENTRYPOINT ["/usr/bin/tini", "--", …]`).
- Healthcheck uses `node /app/docker/healthcheck.js` (no `curl` in the slim image).
- Final image stays under the 450 MB budget enforced by Layer 3 of the harness.
- `compose up -d` runs read-only with `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`, and a 512 MB memory cap.

Layer 4 of the harness will fail loudly if you break any of these. That's intentional.

## Validating a new client stack

The project tracks live end-to-end validation per client in [`docs/STATUS.md`](./docs/STATUS.md). A client is "validated" when someone has:

1. Connected the real client to the quillmark server (HTTP or stdio).
2. Called `create_document` or `compose_document` and received `{status: "success", url: ...}`.
3. Confirmed the PDF at that URL is valid (%PDF magic, 10 KB+, renders in a viewer).
4. Recorded the evidence (screenshot, terminal log, or commit SHA).
5. Opened a PR flipping the status in `docs/STATUS.md` and the client doc's banner.

If you want to validate an in-progress client, look for issues labeled `status:needs-validation` — each one has setup steps and acceptance criteria.

## The Ollama sidecar architecture

Local models (Qwen 3 8B, Llama 3.1, Mistral-Nemo, etc.) struggle to produce valid YAML frontmatter as a raw string argument. To help them without changing the contract Claude Code and hosted-model clients rely on, `install-ollama.sh` launches a **separate** container named `quillmark-mcp-ollama` on port 8765 with `QUILLMARK_LOCAL_MODEL_MODE=1`. That env var tells the server to expose a 4th tool — `compose_document` — which accepts structured JSON params (`quill`, `fields`, `body`) and assembles the YAML on the server side.

The default port-8080 endpoint is never touched by this flow. Two containers, two ports, two tool surfaces. Claude Code always sees exactly 3 tools.

If you're adding or modifying `compose_document`, run the Layer 5d Docker test:
```sh
npm run test:docker   # Layer 5d starts a container with the env var and validates the 4-tool surface
```

## PR workflow

1. Branch off `main`: `git switch -c feat/<short-name>` or `fix/<short-name>`.
2. Make your edits. Run the test matrix from the "Which tests to run" table above.
3. Commit in logical chunks. Use imperative, present-tense commit messages (`feat: ...`, `fix: ...`, `docs: ...`). No co-author trailers.
4. Push your branch and open a pull request against `main`. The [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) has a checklist — fill it out.
5. CI runs `npm test` automatically. If your change touches server/Docker code, add the `test:docker` label to trigger the full six-layer harness.
6. Once CI is green, self-approve (`gh pr review --approve` or the GH web UI) and squash-merge.
7. Delete the branch (squash-merge with `--delete-branch` does this automatically).

This is a self-approve workflow — there's no second reviewer gate today. The tradeoff is speed; the safety net is CI + the test harness. If something breaks on main, fix forward in a new PR.

## Documentation

Technical docs live in `docs/wiki/` and auto-publish to the [GitHub Wiki](https://github.com/nibsbin/quillmark-mcp/wiki) on every push to main (via `.github/workflows/wiki.yml`).

- **Hand-written pages** cover architecture, CLI, tools, strategies, quills, Docker, testing, security, and more.
- **API Reference** is auto-generated from JSDoc annotations by `jsdoc-to-markdown`. Run `npm run docs:api` locally to regenerate.
- **To add/edit wiki pages**: edit files in `docs/wiki/`, open a PR. The wiki auto-syncs after merge.
- **When adding new source files**: add JSDoc annotations (`@module`, `@param`, `@returns`, `@throws`). The API reference picks them up automatically on next push to main.
- **JSDoc rules**: use JSDoc Closure-style types (`{Function}`, `{object}`, `{string}`) — not TypeScript arrow syntax. See existing annotations for examples.

## References

- `README.md` — stack, architecture, install paths, tool reference
- `PROGRAM.md` — design philosophy, LLM agent journeys, future bookmarks
- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
- [Model Context Protocol specification](https://modelcontextprotocol.io)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)

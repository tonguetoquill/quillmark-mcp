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
  bin.js            # CLI + env-var fallbacks + signal routing
  primitives/       # pure functions — no internal state
  strategies/       # DeliveryStrategy (abstract) + RenderAndHostStrategy
  mcp/              # McpSdkServerAdapter + QuillmarkMCP + createDefaultMCP
test/
  *.test.js         # host unit tests
  docker/*.test.js  # docker-gated via DOCKER_TEST=1 (or DOCKER_INSTALL_TEST=1)
scripts/
  *.sh              # install, uninstall, test harnesses
Dockerfile, docker-compose.yml, .dockerignore
```

## Which tests to run for which change

| You edited… | Run these |
|---|---|
| `src/primitives/*` | `npm test` |
| `src/strategies/*` | `npm test` |
| `src/mcp/QuillmarkMCP.js` (tool registration) | `npm test` + `npm run test:docker` (Layer 5) |
| `src/mcp/McpSdkServerAdapter.js` (HTTP routing, JSON 404) | `npm run test:docker` (Layers 4 + 5) |
| `src/bin.js` (CLI, env vars, transports) | `npm test` + manual stdio smoke |
| `Dockerfile` or `.dockerignore` | `npm run test:docker` (all 6 layers) |
| `docker-compose.yml` | `npm run test:install` |
| `scripts/install-mcp.sh` / `uninstall-mcp.sh` | Manual: uninstall → install → smoke → uninstall |
| `scripts/docker-test.sh` | `npm run test:docker` |
| `quills/**` or adding a new quill | `npm test` + manual end-to-end Claude Code render |
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

## Submitting changes

1. Branch off `main`: `git switch -c feat/<short-name>` or `fix/<short-name>`.
2. Make your edits. Run the test matrix from the "Which tests to run" table.
3. Commit in logical chunks. Use imperative, present-tense commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
4. Push your branch and open a pull request against `main`. In the PR body, include:
   - Why (the motivation, not the diff — the diff speaks)
   - What changed at a high level
   - How you tested it (which `npm run` commands, which manual smoke)
5. CI isn't wired up yet — the release gate is running the harness locally and being honest about what you ran.

## References

- `README.md` — stack, architecture, install paths, tool reference
- `PROGRAM.md` — design philosophy, LLM agent journeys, future bookmarks
- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
- [Model Context Protocol specification](https://modelcontextprotocol.io)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)

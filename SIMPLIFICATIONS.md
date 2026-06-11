# Simplification Pass — Findings & Decisions

This repo's mission: teach consumers (human or AI) how to build a bespoke Quillmark MCP
server. The conceptual core is **three pure primitives → three MCP tools, a
`DeliveryStrategy` extension point, and a drop-in `quiver/` layout**. Everything below was
judged against that mission. Per instructions, `eval/` was off-limits for removal.

~~Struck-through~~ items are **implemented** in this pass (low-risk). Unstruck items are
proposals awaiting your review.

---

## 1. Removed files (implemented)

### Scripts
- ~~`scripts/render-one.mjs`~~ — **broken against the current API** (imports `Quillmark`
  instead of `Engine`, checks `result.status` where `createDocument` returns `{ ok }`).
  Referenced by nothing. A scratch tool that could only mislead.
- ~~`scripts/claude-reset.sh`~~ — workaround for an upstream Claude Code OAuth bug that
  mutates the user's global `~/.claude/.credentials.json`. Contradicts the repo's own
  "we never touch client config" philosophy. Teaches nothing about MCP servers.
- ~~`scripts/test-mcp-install.sh`~~ — **dead on arrival**: invokes `--no-claude` and
  `--keep-registration`, flags that `install-mcp.sh`/`uninstall-mcp.sh` no longer define,
  so it exits 2 on first use. Leftover from a pre-revert era.
- ~~`scripts/docker-test.sh`~~ — a 134-line "six-layer" gauntlet (hadolint, shellcheck,
  npm-audit, dockle, trivy, docker-scout, size/layer budgets). Private CI ceremony, not
  teaching material. Never ran in CI.

### Tests
- ~~`test/docker/`~~ (5 files, ~1,170 lines) — gated behind `DOCKER_TEST=1`, **never ran in
  CI**, required a local Docker daemon + built image. Container-hardening and PDF-byte
  assertions test ops posture and upstream Typst output, not this repo's code. The MCP
  protocol guarantees they checked are covered hermetically by `test/mcp/QuillmarkMCP.test.js`.
- ~~`test/smoke.test.js`~~ — asserted `1 + 1 === 2`. Tested Node's test runner.
- ~~`test/cli/config-snapshot.test.js` + `test/fixtures/configs/`~~ — brittle golden-string
  snapshots of install-snippet output. The `config` subcommand is still covered by
  `test/bin.test.js`.

### GitHub boilerplate (all referenced files that don't exist — `docs/STATUS.md`,
`CONTRIBUTING.md`, `SECURITY.md`, `docs/clients/`)
- ~~`.github/dependabot.yml`~~ — 61 lines of update automation + label taxonomy for a repo
  that isn't operated as a product.
- ~~`.github/CODEOWNERS`~~, ~~`.github/PULL_REQUEST_TEMPLATE.md`~~,
  ~~`.github/ISSUE_TEMPLATE/`~~ (3 templates + config) — dead checkboxes and links into a
  `docs/` tree that was deleted in an earlier revert.

### Root docs & config
- ~~`CHANGELOG.md`~~ — described releases that were never tagged (no git tags exist), and
  was stale by 15+ commits. An example repo has no upgrade-tracking consumers.
- ~~`CODE_OF_CONDUCT.md`~~ — boilerplate covenant; no community to govern.
- ~~`QUILLMARK_FEEDBACK.MD`~~ — a one-off friction log from the wasm 0.87→0.90 upgrade.
  Belongs in an upstream issue; stale by construction.
- ~~`.devcontainer/`~~ — configured for a *different project* (`tonguetoquill-web`),
  rewrote apt sources, and installed `nikto` (a web pen-testing tool). Bizarre creep.
- ~~`.editorconfig`~~ — inessential for an example.
- ~~`.gitignore`~~ — rewritten from 159 lines of create-react-app/Gatsby/Nuxt/Svelte
  boilerplate down to the ~18 lines that apply to this project.
- ~~`.dockerignore`~~ — tightened; now also excludes `test/`, `eval/`, `scripts/` from the
  build context (the runtime image needs none of them).

### Junk
- ~~`quiver/quills/.DS_Store`~~, ~~`.artifacts/usaf_memo-*.pdf`~~ (a committed render
  artifact that contradicted `.gitignore`), ~~six `.gitkeep` files~~ in directories full
  of real code.

### `package.json` scripts
- ~~`test:docker`, `test:install`, `claude:reset`~~ — pointed at removed/broken scripts.
- ~~`preversion`, `postversion`, `release:patch/minor/major`, `prerelease`~~ — full npm
  release machinery for a package that has never cut a tag. Examples don't release.

## 2. Code simplifications (implemented)

- ~~`src/logger.js`: deleted the multi-arg / Error / metadata-object formatting branches~~ —
  every call site in the repo passes a single string; the branches were dead code
  (42 → 19 lines).
- ~~`availableQuillsHint()` deduplicated~~ — was copied byte-for-byte in
  `getSpec.js` and `createDocument.js`; now one shared `src/primitives/availableQuillsHint.js`.
- ~~`authToken` removed end-to-end~~ — an auth feature spanning three files
  (`bin.js --auth-token`, `cli/config.js` Bearer snippets, `McpSdkServerAdapter.js`
  Bearer check) that nothing in the repo, tests, or install flow ever set. Premature
  configurability for a hosted scenario the example doesn't cover.
- ~~`cli/config.js`: dropped the `throw new Error('unreachable')` default case~~ — dead
  branch already guarded by the `SUPPORTED[client]` check.
- ~~`Dockerfile`: removed the middle `test` build stage~~ — it ran `npm ci` (full dev deps)
  + the whole test suite *inside every image build*, duplicating CI. The runtime stage
  only copies from `deps`, so this is a pure deletion. (Image build verified.)
- ~~`docker-compose.yml`: removed the speculative "future sidecar" comment blocks~~ —
  forward-compat documentation for services that don't exist.
- ~~`McpSdkServerAdapter`: added `.png` to `MIME_TYPES`~~ — `RenderAndHostStrategy` could
  *write* `.png` artifacts but the adapter couldn't *serve* them; the two maps now agree.
- ~~README: removed the `npm run test:docker` reference.~~

`npm test`: 72/72 pass after all of the above.

---

## 3. Proposals — not implemented, for your review

### M1. Drop the unused `engine` parameter from `listQuills` and `getSpec` (recommend: do it)
`listQuills(quiver, engine)` and `getSpec(quiver, engine, ref)` never touch `engine`;
only `createDocument` actually uses it (passes it to `strategy.handle`). The
"`(quiver, engine)` catalog prefix" documented in PROGRAM.md is uniformity for its own
sake — two of three primitives carry a dead parameter, which is actively confusing for
someone copying the pattern. **Why not auto-applied:** it changes the public
`quillmark-mcp/primitives` signatures and ripples to `QuillmarkMCP.js`, three test files,
and PROGRAM.md. Mechanical, but an API decision you should bless.

### M2. Consolidate the LLM-coaching prose (recommend: do it, carefully)
The "how to write card-yaml" guidance lives in four places: `getSpec.FORMAT_RULES`,
`createDocument.MISSING_QUILL_MESSAGE`, and two multi-sentence Zod `error`/`describe`
blocks in `QuillmarkMCP.js`. Three of them re-explain "name@version, not @latest".
One module exporting the shared strings would make the instruction boundary obvious.
**Why not auto-applied:** this text is what LLMs see in tool results — it is measured
behavior (the eval exists to measure exactly this), so changing it deserves an eval run.

### M3. Slim `scripts/install-mcp.sh` from 219 to ~80 lines (recommend: do it)
The `--port` override machinery (generates a `docker-compose.override.yml` heredoc)
existed mainly to serve the now-deleted `test-mcp-install.sh`. The hand-rolled
`docker inspect` health-poll loop can become `docker compose up -d --wait`. Keep:
preflight, build, up, `.mcp.json`, client snippets. **Why not auto-applied:** it's the
README's primary install path; I didn't want to rewrite it and the verification story in
the same pass you're reviewing.

### M4. Inline `docker/healthcheck.js` into the Dockerfile (recommend: skip)
The 55-line file is ~35 lines of JSDoc around a simple GET probe and could be a
`node -e` one-liner in `HEALTHCHECK`. But the file's one real feature — deriving the
port from `QUILLMARK_BIND` — would be lost, and a named file with a short comment is
arguably *more* readable than a quoted one-liner. Trim its doc essay instead (done in
the docs pass).

### M5. Trim test bloat in kept files (recommend: do a light pass)
- `test/createDocument.test.js`: three near-duplicate pairs (quoted-scalar, missing-`$quill`,
  unknown-ref) differ only in asserted hint substrings — collapse to ~6 cases.
- `test/bin.test.js` (291 lines): exhaustive CLI/env precedence permutations; ~4
  representative cases (http, stdio, env-fallback, missing-dir) carry the teaching value.
- `test/integration.test.js`: the error-path block duplicates `createDocument.test.js`.

### M6. Reduce `bin.js`'s dependency-injection harness (recommend: keep as-is)
`main(argv, deps)` accepts eight injectable dependencies purely so `bin.test.js` can run
it in-process. It's the most "enterprise" pattern left in src/, but the alternative
(spawning subprocesses in tests) is slower and flakier. Acceptable cost; documented now.

### M7. Thin `QuillmarkMCP` constructor duck-typing (recommend: keep)
Four `TypeError` guards validate injected collaborators' shapes. Heavy-ish, but
"fail loudly at construction, not first request" is a defensible lesson for a class
whose whole point is dependency injection.

---

## 4. Considered and deliberately kept

- **`eval/` untouched** (per instructions), including `test/eval-modes.test.js` — it is
  the harness's only CI coverage. Note: eval hard-depends on `src/bin.js --stdio`
  (`eval/run.js` spawns it) and soft-depends on `quiver/quills/*/<version>/example.md`.
- **`integration.test.js` shipped-quills render loop** — contra my reviewer's advice.
  It is the only guard that the 7 shipped quills stay compatible with engine upgrades
  (git history shows wasm bumps breaking quills), and the whole suite still runs in ~3s.
- **`RenderAndHostStrategy`'s `format` option** — the natural knob on the extension
  point; legitimate teaching of strategy configurability.
- **`PANIC_PATTERNS` panic-wrapping in `createDocument`** — product behavior: an LLM in
  a tool-use loop must be told "this is a renderer bug" vs "fix your content".
- **Adapter-level host/port/endpoint defaults** — they look redundant under `bin.js`,
  but they fire for library consumers calling `mcp.start()` directly.
- **Docker hardening** (non-root UID, read-only rootfs, `cap_drop: ALL`, tini) — running
  MCP servers non-root is a real best practice worth modeling.
- **`ci.yml` + `.nvmrc`** — minimal and load-bearing (badge, `node-version-file`).
- **`scripts/install-mcp.sh` / `uninstall-mcp.sh`** — the README's primary quick start
  (slimming proposed as M3, not removal).

## 5. Pre-existing issues fixed in passing

- `eval/README.md` fleet table omitted `openai/gpt-oss-120b` (10th model in config.json).
- README "Uninstall" section had broken inline code fences.
- `package.json` had empty `description`/`keywords`/`author`.

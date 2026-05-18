# Changelog

## [Unreleased]

Quillmark engine upgrade and source-layout reorganisation. Breaking changes for users who embed quillmark-mcp as a library or who set the legacy CLI flags / env vars.

### Engine

- **Bumped `@quillmark/wasm` 0.77.0 → 0.80.0**. The wasm engine moved from a per-instance quill registry to a stateless factory: `engine.quill(tree) → Quill`, with rendering on `quill.render(doc, opts?)` and parsing on `Document.fromMarkdown(content)`. Engine-level `registerQuill`, `dryRun`, `parseMarkdown`, `getQuillInfo`, and `getQuillSchema` are gone.
- **Replaced `@quillmark/registry` with `@quillmark/quiver` (^0.5.1)**. Quiver owns quill selection, version resolution, and per-`(engine, canonical-ref)` caching. The pre-render `engine.dryRun` validation step is folded into the parse + render path.
- **Dropped the `js-yaml` dependency**. `quill.metadata.schema` is now a plain JS object straight from the engine; the YAML round-trip is unnecessary.

### Quill.yaml format

- Top-level key is now lowercase `quill:` (was `Quill:`).
- Composable card definitions live under `card_kinds:` (was `card_types:`).
- `example_file` is no longer a valid key in the `quill:` section; removed from all shipped quills.
- All seven shipped quills + the test fixture migrated. Authors of custom quills must apply the same renames; the engine does not accept the legacy keys.
- Quill-level `description:` (under `quill:`) now surfaces at `metadata.description` — independent of `metadata.schema.main.description` (the schema description of the entry-point card).

### Source layout

- **New `quiver/` directory at the repo root.** Holds `Quiver.yaml` + `quills/<name>/<x.y.z>/...` per the `@quillmark/quiver` Source Quiver spec. The folder is publishable as a standalone npm package via `Quiver.fromPackage`.
- Existing `./quills/` directory was moved verbatim under `quiver/quills/`.

### CLI

- `--quills-dir` → `--quiver-dir` (default `./quiver`).
- `QUILLMARK_QUILLS_DIR` → `QUILLMARK_QUIVER_DIR`.
- The Dockerfile + `docker-compose.yml` honour the renamed env var; the `COPY` instruction now copies `quiver/` instead of `quills/`.

### Library API

- `createDefaultMCP({ quillsDir, strategy })` → `createDefaultMCP({ quiverDir, strategy })`.
- `QuillmarkMCP` constructor: `{ registry, strategy, server }` → `{ quiver, engine, strategy, server }`.
- Primitive signatures shifted from `(registry, ...)` to `(quiver, engine, ...)`. `createDocument` now takes the document content directly, parses it via `Document.fromMarkdown`, and passes `(quill, doc)` (not `(quillBundle, content)`) to the strategy.
- `DeliveryStrategy.handle(quill, doc)` — `doc` is a parsed `Document`, not a markdown string. Subclasses that previously extracted YAML or re-parsed content can drop that work.

### Internal cleanup

- New `src/errors.js` consolidates the `getErrorMessage` helper that was duplicated in primitives + strategies.
- `src/primitives/createDocument.js` lost the bespoke YAML frontmatter parser, quote stripper, and dryRun validator. `Document.fromMarkdown(content).quillRef` replaces them.
- Net source delta: **-343 LOC** vs the wasm-0.54 baseline across the full migration.

## [0.2.0] - 2026-04-15

Surgical revert to the PROGRAM.md invariant: three primitives, three tools, 1:1.

Dropped `compose_document` (4th tool), `composeYaml` primitive, `QUILLMARK_LOCAL_MODEL_MODE` gate, and 10 non-essential client integrations (claude-desktop, cursor, vscode, cline, continue, chatgpt, openai-*, ollama-*). Also removed TypeDoc-generated wiki docs, auto-docs CI, `scripts/install-ollama.sh`, `CONTRIBUTING.md`, `phases/`, `prose/`, and demo runbook files. Claude Code + Codex CLI remain the only "batteries-included" integrations; other MCP clients connect against the standard HTTP/stdio transports directly.

Kept the post-revert bug fixes that are unrelated to the Docker rewrite: stateless HTTP transport, stderr-only logger, wasm 0.54 schema migration, NYT and CNN news article quills.

## [0.1.0] - 2026-04-12

Initial release. Three MCP tools (`list_quills`, `get_specs`, `create_document`) over stdio + Streamable HTTP. Docker image, one-command install script, Claude Code + Codex client snippets.

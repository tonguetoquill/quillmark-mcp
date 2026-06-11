# Quillmark MCP

Three primitives. Three tools. 1:1. No gating.

quillmark-mcp is the foundation. Separate repos extend it for specific domains — same primitives, purpose-fit defaults, no core modifications.

## Stack

- Node.js ≥ 24
- `@modelcontextprotocol/sdk` — Streamable HTTP + stdio
- `@quillmark/wasm` — Quillmark document rendering engine (`Engine`, `Document`, `Quill`)
- `@quillmark/quiver` — Source Quiver loading + selector resolution + per-quill caching

## Primitives

Pure functions. Dependencies injected as arguments. No internal state. The MCP server is built from these primitives — sugar, not a separate layer.

- `listQuills(quiver, engine)` → `[{ name, version, description }]`
- `getSpec(quiver, engine, ref)` → `{ instruction, blueprint }`
- `createDocument(quiver, engine, strategy, content)` → `{ ok, message?, diagnostics?, url?, mimeType? }`

The `(quiver, engine)` prefix is the catalog layer; `strategy` is the persistence extension point. (`listQuills` and `getSpec` carry `engine` for signature uniformity but don't use it; only `createDocument` passes it on to `strategy.handle`.)

## Instruction boundary

- **Tool-level**: baked into each primitive. Describes how to use the tool.
- **Per-quill authoring**: provided by the quill via `quill.metadata` (description, schema, example, instructions). We pass it through.

We own tool guidance. Quills own content guidance.

## Document pipeline

```
Document.fromMarkdown(content)
  → quiver.getQuill(doc.quillRef)
  → strategy.handle(quill, doc, engine)
  → { ok, message?, diagnostics?, url?, mimeType? }
```

Parsing throws on a malformed `~~~card-yaml` block (missing `$quill`,
malformed YAML, unclosed block, etc.) — `createDocument` catches and
converts it to a structured `{ ok: false, message, diagnostics? }`
result. Quiver resolves the selector ref to a canonical version and
materialises an engine-free `Quill` handle (cached per canonical ref).
The strategy decides what happens next — render, pass through, or
delegate. On success the strategy returns `{ url, mimeType }`, which
`createDocument` surfaces as `{ ok: true, url, mimeType }`.

The default `RenderAndHostStrategy` calls `engine.render(quill, doc)`
and writes the artifact to disk; constructor injection is the only
extension point.

## Quiver layout

```
quiver/
  Quiver.yaml             # name + description (per @quillmark/quiver spec)
  quills/
    <name>/
      <x.y.z>/            # canonical semver only
        Quill.yaml        # quill: section + main + card_kinds
        plate.typ
        example.md
        ...
```

The `quiver/` folder is itself a self-contained Source Quiver — it
satisfies `Quiver.fromDir`, `Quiver.fromPackage`, and `Quiver.build`
without modification, so you can publish it as its own npm package
later if you want to ship the quill collection independently of the
MCP server.

## Extensibility

Drop a Quill directory into `quiver/quills/<name>/<x.y.z>/`. Restart.
Quiver auto-discovers it; `list_quills` surfaces it; `create_document`
renders it. No code changes.

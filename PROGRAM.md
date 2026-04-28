# Quillmark MCP

Three primitives. Three tools. 1:1. No gating.

quillmark-mcp is the foundation. Separate repos extend it for specific domains — same primitives, purpose-fit defaults, no core modifications.

## Stack

- Node.js ≥ 24
- `@modelcontextprotocol/sdk` — Streamable HTTP + stdio
- `@quillmark/wasm` — Quillmark document rendering engine
- `@quillmark/quiver` — Quill collection loading + selector resolution

## Primitives

Pure functions. Dependencies injected as arguments. No internal state. The MCP server is built from these primitives — sugar, not a separate layer.

- `listQuills(quiver, engine)` → `[{ name, description }]`
- `getSpecs(quiver, engine, ref)` → TOON-encoded schema + authoring instructions
- `createDocument(quiver, engine, strategy, content)` → `{ status, url?, errors? }`

## Instruction boundary

- **Tool-level**: baked into each primitive. Describes how to use the tool.
- **Per-quill authoring**: provided by the quill via `@quillmark/wasm`. We pass it through.

We own tool guidance. Quills own content guidance.

## Delivery Strategy

```
parse(content) → quiver.getQuill(ref, { engine }) → strategy.handle(quill, doc) → { status, url?, errors? }
```

`Document.fromMarkdown` parses and validates structure; Quiver resolves the
quill ref and materialises a render-ready `Quill` handle. The strategy
decides what happens next — render, pass through, or delegate. The default
`RenderAndHostStrategy` calls `quill.render(doc)` and returns a URL.
Constructor injection; the only extension point.

## Extensibility

Drop a Quill directory into `quiver/quills/<name>/<x.y.z>/`. Restart.
Quiver auto-discovers it; `list_quills` surfaces it; `create_document`
renders it. No code changes.

The `quiver/` folder is itself a self-contained Source Quiver
(`Quiver.yaml` + `quills/`) per the `@quillmark/quiver` spec — publishable
as its own npm package if you ever want to ship it independently.

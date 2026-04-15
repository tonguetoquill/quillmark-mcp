# Quillmark MCP

Three primitives. Three tools. 1:1. No gating.

## Stack

- Node.js ≥ 24
- `@modelcontextprotocol/sdk` — Streamable HTTP + stdio
- `@quillmark/wasm` — Quillmark document rendering engine
- `@quillmark/registry` — Quill discovery and loading

## Primitives

Pure functions. Dependencies injected as arguments. No internal state. The MCP server is built from these primitives — sugar, not a separate layer.

- `listQuills(registry)` → `[{ name, description }]`
- `getSpecs(registry, ref)` → TOON-encoded schema + authoring instructions
- `createDocument(registry, strategy, content)` → `{ status, url?, errors? }`

## Instruction boundary

- **Tool-level**: baked into each primitive. Describes how to use the tool.
- **Per-quill authoring**: provided by the quill via `@quillmark/wasm`. We pass it through.

We own tool guidance. Quills own content guidance.

## Delivery Strategy

```
validate(quill, content) → strategy.handle(quill, validatedContent) → { status, url?, errors? }
```

Validation is always in the core path. The strategy decides what happens next — render, pass through, or delegate. The default `RenderAndHostStrategy` renders via `@quillmark/wasm` and returns a URL. Constructor injection; the only extension point.

## Extensibility

Drop a Quill directory into `quills/`. Restart. `FileSystemSource` auto-discovers it; `list_quills` surfaces it; `create_document` renders it. No code changes.

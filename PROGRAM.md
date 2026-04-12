# Quillmark MCP

Surfaces primitives and MCP integration of Quillmark. Surface schematized document rendering to LLM consumers.

## Technical Stack

- Node.js ≥ 24 (`engines` field in package.json)
- `@modelcontextprotocol/sdk` ^1.29 — Streamable HTTP + stdio server transports
- Built-in `node:test` runner for unit tests
- `@quillmark/wasm` ^0.51.1 — the core document rendering engine (compiled WASM, no native binary)
- `@quillmark/registry` ^0.12 — packing, loading, and managing collections of quills
- `@toon-format/toon` ^2.1 — JSON Schema → token-efficient TOON encoding for LLM consumers
- `loglevel` ^1.9 — stderr-only logging wrapper (stdout is reserved for the JSON-RPC wire protocol in stdio mode)

## Philosophy

- **Less is more.** Prompts and tools should be minimal and semantically dense. Consumers needing richer context layer it above us.
- **Composable.** MCP server is plug-and-play, but the primitives powering it are independently usable — for LangChain agents, custom pipelines, etc. Architecture should make a future library split clean without prematurely doing it.

## Primitives

Pure functions that take their dependencies (registry, strategy) as arguments. No internal state. The MCP server is built entirely from these primitives — it's sugar, not a separate layer.

- `listQuills(registry)` → quill metadata array
- `getSpecs(registry, ref)` → TOON-encoded schema + authoring instructions
- `createDocument(registry, strategy, content)` → { status, url?, errors? }

### Instruction Model

Two kinds of LLM-facing instructions:

- **Static tool-level**: baked into each primitive. Describes how to use the tool. Surfaces as MCP tool descriptions.
- **Dynamic per-quill**: authoring guidance from the quill itself via @quillmark/wasm. We format and pass through — we don't inject opinions about quill-specific content.

**Boundary: quillmark-mcp owns tool usage guidance. Quills own content authoring guidance.**

## Tools

### list_quills

Name and description for each available Quill. Call only when the agent doesn't know which Quill to use (i.e., not pre-specified at a higher layer). Designed for 10-20 quills — defer browsing and discoverability for later.

Never throws. Returns empty list if no quills are available.

### get_specs

Schema and authoring instructions for a Quill. @quillmark/wasm returns JSON Schema; we convert to TOON before serving to minimize token consumption.

Throws if the quill reference is invalid or unavailable.

### create_document

Input:
- content: string — full Quillmark document with YAML frontmatter and markdown body. `QUILL:` must be present in frontmatter; if omitted, returns a structured error for agent self-repair.

Returns:
- status: string
- url: string (optional) — link to the created document
- errors: array (optional)

Validates content, parses the quill reference, then delegates to a delivery strategy. Rendering is always a strategy side effect — this layer returns status, errors, and an optional link.

#### Delivery Strategy (abstract)

```
validate(quill, content) → strategy.handle(quill, validatedContent) → { status, url?, errors? }
```

Validation is always in the core path. The strategy decides everything else — render locally, delegate to an external service, or pass content through.

Example strategies:
- **PassThroughStrategy**: sends structured content to the consumer's service, which renders and returns a URL.
- **RenderAndHostStrategy**: renders via @quillmark/wasm, serves the artifact, returns a download URL. The plug-and-play example (PDF download).

Constructor injection. Delivery strategy is the only extension point. Source, validation, and TOON formatting are internal concerns — not configurable by consumers.

## Initialization

@quillmark/wasm and quills initialize eagerly at startup. Use FileSystemSource from @quillmark/registry.

{{Bookmark: revisit source abstraction and extensibility later.}}

## Testing

Use node:test. Write tests only where they provide clear value. Don't over-invest in infrastructure ahead of a stabilized design.

## AI Agent Journeys

All tools are stateless and idempotent — each call is a fresh document. No edit/patch/session semantics.

### Chatbot

1. **Cold-start discovery**: Agent doesn't know the format. Calls `list_quills`, selects `usaf_memo`, calls `get_specs("usaf_memo")`, then `create_document`.
2. **Warm-start**: Quill pre-specified in system instructions. Agent calls `get_specs`, then `create_document`. No `list_quills` needed.
3. **Iterative refinement**: User says "make the header more formal." Agent re-calls `create_document` with revised content.
4. **Multi-document**: Agent calls `get_specs` for multiple quills, then `create_document` for each.

### Orchestrations

1. **Wargame simulation**: Game engine orchestrates AI to generate artifacts (news reports, cybersecurity reports) in real time. Each artifact is a `createDocument` call delivering to the game's content pipeline.
2. **Document automation**: Metrics piped into an AI workflow for weekly formatted reports. Consumer handles delivery (e.g., PowerAutomate).
3. **Batch generation**: Pipeline generates many reports from a data source. Same quill, different content each time.

## Package Architecture

Two consumption modes from the same package:

1. **Plug-and-play MCP**: `QuillmarkMCP` class wires registry + strategy + fastmcp. One-liner to start a server.
2. **Composable primitives**: Individual functions (`listQuills`, `getSpecs`, `createDocument`) for custom orchestration. Dependencies passed as arguments.

The MCP class is built from the primitives and owns the registry/engine lifecycle. Primitive consumers own their own.

{{Bookmark: revisit entrypoint structure (single root export vs. subpath exports) during implementation.}}

## References

- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
- [@toon-format/toon](https://www.npmjs.com/package/@toon-format/toon)
- [@quillmark/registry](https://github.com/nibsbin/quillmark-registry)

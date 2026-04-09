# Quillmark MCP

Surfaces primitives and MCP integration of Quillmark. Surface schematized document rendering to LLM consumers.

This is a high-level design doc.

## Technical Stack

- node25
- fastmcp@3.35
- built-in node:test runner for unit tests
- @quillmark/wasm@0.51.1, the core document rendering library
- @quillmark/registry, for packing, loading, and managing collections of quills
- @toon-format/toon, for encoding JSON schemas into a token-efficient format for LLM consumers

## Philosophy

- Less is more. Our prompts and tools should be minimal and semantically dense. If AI consumers need more context, defer to higher layers that consume our library.
- Highly composable. While we want the MCP server to be plug and play, the primitives that that support the MCP server should also be composable for consumers that e.g. want to orchestrate a langchain agent instead of an MCP server. In the future, we may even spin off the primitives into another library... but we will defer this complexity for later. Set ourselves up for success with composable architecture today.

## Primitives

Pure functions that take their dependencies (registry, strategy) as arguments. No internal state. The MCP server is built entirely from these primitives — it's sugar, not a separate layer.

- `listQuills(registry)` → quill metadata array
- `getSpecs(registry, ref)` → TOON-encoded schema + authoring instructions
- `createDocument(registry, strategy, content)` → { status, url?, errors? }

### Instruction Model

Primitives carry two kinds of LLM-facing instructions:

- **Static tool-level instructions**: baked into each primitive. Describe how to use the tool (e.g., "call listQuills when you don't know which Quill to use"). These surface as MCP tool descriptions.
- **Dynamic per-quill instructions**: authoring guidance that comes from the quill itself via @quillmark/wasm (e.g., "the subject field should be a single concise line"). Our layer formats and passes these through — we don't inject opinions about how to write for a specific quill.

Boundary: **quillmark-mcp owns tool usage guidance. Quills own content authoring guidance.**

## Tools

### list_quills

Lists each Quill format's name and description. Should only be called by agent when it doesn't know which Quill to use (e.g., Quill is not specified in instructions at higher layer). 

Simple pass-through of registry metadata. No filtering, search, or ranking. For now, design for 10-20 quills. Defer scalable browsing and discoverability design for way later.

This tool does not throw. If no quills are available, it returns an empty list.

### get_specs

Gets the schema and instructions for a particular Quill. @quillmark/wasm returns jsonschema objects. We convert to TOON (via @toon-format/toon) before serving to AI user to minimize token consumption.

Throws if the quill reference is invalid or unavailable.

### create_document

Creates a Quill document.

Input:
- content: string -- the full Quillmark document including YAML frontmatter and markdown body. The `QUILL:` field must be present in the frontmatter. If omitted, the tool returns an error so the AI agent can repair the content.

Returns JSON object with:
- status: string
- url: string (optional) -- link to the created document
- errors: array (optional)

The core quillmark-mcp layer is not aware of rendering. It validates, parses the quill reference from content, and delegates to a delivery strategy. Rendering is always a side effect handled by the strategy -- the tool only returns status, optional errors, and an optional link.

#### Delivery Strategy (abstract)

How that URL is produced varies by consumer. `create_document` delegates to an abstract delivery strategy injected at construction time:

```
validate(quill, content) → strategy.handle(quill, validatedContent) → { status, url?, errors? }
```

Validation is always in the core path. The strategy decides everything else -- whether to render locally, delegate to an external service, or just pass content through.

Example strategies:
- **PassThroughStrategy**: sends structured content to the consumer's own service, which renders and returns a URL.
- **RenderAndHostStrategy**: renders via @quillmark/wasm, serves the artifact, returns a direct download URL. This is the plug-and-play example strategy (PDF download).

Constructor injection keeps it simple. If a consumer needs complex output routing, they implement the interface.

Delivery strategy is the only extension point. Source, schema formatting, and validation are internal concerns — not configurable by consumers for now.

## Initialization

@quillmark/wasm engine and quills are initialized eagerly at startup. Use FileSystemSource from @quillmark/registry for now.

{{Bookmark: revisit source abstraction and extensibility later.}}

## Error Handling

Surface all errors to the AI agent for debugging. The intention is to give agents enough feedback to self-repair. Don't hide or simplify errors.

- `list_quills`: does not throw. Returns empty list if no quills available.
- `get_specs`: throws if quill reference is invalid or unavailable.
- `create_document`: returns structured errors (missing `QUILL:` field, validation failures, strategy failures).

## Testing

KISS. We don't know exactly what we want to build yet, so testing philosophy is minimalism. Use node:test. Write tests only where they provide clear value. Don't over-invest in test infrastructure ahead of stabilized design.

## AI Agent Journeys

Here are some agent journeys/use cases that we should design for.

All tools are stateless and idempotent. Each call is a fresh document — no edit/patch/session semantics. Defer stateful, sliced edits for the future.

### Chatbot

These chatbot journeys use the MCP server.

1. **Cold-start discovery**: End user uploads slide decks and other context about a recent project and asks to draft a recommendation letter in the official memorandum format. Agent calls `list_quills` and selects `usaf_memo` format. Agent calls `get_specs("usaf_memo")` to learn how to write the memo. Agent then creates the memo with `create_document("content")`.
2. **Warm-start (quill pre-specified)**: End user has a conversation about a new policy to distribute. The agent's system instructions already specify the quill to use. Agent pulls the schema for `usaf_memo` and then writes/creates the memo with `create_document("content")`. No `list_quills` call needed.
3. **Iterative refinement**: Agent creates a document, user says "make the header more formal." Agent calls `create_document` again with revised content. Each call is a fresh document — no edit semantics.
4. **Multi-document**: "Draft a memo and a cover letter." Agent calls `get_specs` for two different quills, then `create_document` twice.

### Orchestrations

These AI orchestrations use the primitives in the quillmark-mcp package. The delivery strategy determines how the URL is produced and surfaced — the consumer decides what to do with it.

1. **Wargame simulation**: The game engine orchestrates AI to generate artifacts (news reports, cybersecurity reports, etc.) in real time. Each artifact is a `createDocument` call with a strategy that delivers to the game's content pipeline.
2. **Document automation**: Metrics are piped into an AI workflow to generate a formatted report every week. Sent or integrated in PowerAutomate via consumer's custom logic.
3. **Batch generation**: A pipeline generates many reports from a data source. Same quill, different content each time. Validates that primitives hold no per-call state.

## Package Architecture

Two consumption modes from the same package:

1. **Plug-and-play MCP**: A configurable `QuillmarkMCP` class that wires registry + strategy + fastmcp. One-liner to start a server. Accepts a delivery strategy at construction time.
2. **Composable primitives**: Individual functions (`listQuills`, `getSpecs`, `createDocument`) for consumers building their own orchestration (LangChain, custom pipelines, etc.). Dependencies passed as arguments.

The MCP class is built entirely from the primitives. It owns the registry/engine lifecycle. Primitive consumers own their own.

{{Bookmark: revisit entrypoint structure (single root export vs. subpath exports) during implementation.}}

## References

- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
- [@toon-format/toon](https://www.npmjs.com/package/@toon-format/toon)
- [@quillmark/registry](https://github.com/nibsbin/quillmark-registry)
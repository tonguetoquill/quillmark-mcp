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

Deferred. Focus on high-level tool design first, then derive primitives from what the tools actually need.

## Tools

### list_quills

Lists each Quill format's name and description. Should only be called by agent when it doesn't know which Quill to use (e.g., Quill is not specified in instructions at higher layer). 

For now, design for 10-20 quills. Defer scalable browsing design for way later.

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

{{Bookmark: revisit delineation between core layer and strategy. Need to think more about the abstraction/extensibility pattern.}}

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

{{Note that these journeys are all just drafts and not final. We can design for new journeys and tools as needed.}}

### Chatbot

These chatbot journeys use the MCP server.

1. End user uploads slide decks and other context about a recent project and asks to draft a recommendation letter in the official memorandum format. Agent calls `list_quills` and select `usaf_memo` format. Agent calls `get_specs("usaf_memo")` to learn how to write the memo. Agent then creates the memo with `create_document("content")`
2. End user has a conversation about a new policy to distribute. After a decision point, the Agent asks "Want me to draft up memo for this policy?" {{How does the agent know that it's able to write a memo? Can we expose general capabilities context in tool headers?}} End user responds "Yes please". The Agent pulls the schema for `usaf_memo` and then writes/creates the memo with `create_document("content")`. {{I just realized something. Our tool is general purpose with third party Quill libraries. Potentially, there could be multiple memo formats. We shouldn't hardcode any specific formats or biases in our layer of this library}}.

### Orchestrations

These AI orchestrations use the primitives in the quillmark-mcp package.

1. Generate products for dynamic LLM-generated wargame simulation. The game engine will orchestrate AI to generate artifacts (news reports, cybersecurity reports, etc.) in real time to surface to end users. {{How will output product flow to users?--Should we support direct downloads in addition to API send-offs?}}
2. Document automation: metrics are piped into an AI workflow to generate a formatted report every week. Sent or integrated in PowerAuotomate via consumer's custom logic.

## Package Architecture

{{Bookmark: discuss entrypoint structure and how consumers import primitives vs. start the MCP server.}}

## References

- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
- [@toon-format/toon](https://www.npmjs.com/package/@toon-format/toon)
- [@quillmark/registry](https://github.com/nibsbin/quillmark-registry)
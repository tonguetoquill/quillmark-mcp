# Quillmark MCP

Surfaces primitives and MCP integration of Quillmark. Surface schematized document rendering to LLM consumers.

This is a high-level design doc.

## Technical Stack

- node25
- fastmcp@3.35
- built-in node:test runner for unit tests
- @quillmark/wasm@0.51.1, the core document rendering library
- @quillmark/registry, for packing, loading, and managing collections of quills

## Philosophy

- Less is more. Our prompts and tools should be minimal and semantically dense. If AI consumers need more context, defer to higher layers that consume our library.
- Highly composable. While we want the MCP server to be plug and play, the primitives that that support the MCP server should also be composable for consumers that e.g. want to orchestrate a langchain agent instead of an MCP server. In the future, we may even spin off the primitives into another library... but we will defer this complexity for later. Set ourselves up for success with composable architecture today.

## Primitives

{{What primitives should we create to support our tools?}}

## Tools

### list_quills

Lists each Quill format's name and description. Should only be called by agent when it doesn't know which Quill to use (e.g., Quill is not specified in instructions at higher layer). 

{{Should we expose a search tool in addition to or instead of list_quills? Or maybe have a simple optional string filter that matches against title and description? Or keywords/tags?}}

For now, design for 10-20 quills. Defer scalable browsing design for way later.

### get_specs

Gets the schema and instructions for a particular Quill. @quillmark/wasm returns jsonschema objects. We should convert to TOON before serving to AI user.

### create_document

Creates a Quill document.

Input:
- content: string -- markdown content to render with Quillmark

Returns JSON object with: 
- Status of create_document call
- Errors (optional)
- Link to artifact (optional)

{{Open questions: Different library consumers will do different things. For example, web consumers can pipe the content into their own interface and return a document link to the LLM. Other workflows could involves automatically rendering with Quillmark and returning a direct URL download. Should we make create_document abstract or composable?}}

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

## References

- [Quillmark docs](https://quillmark.readthedocs.io/en/latest/)
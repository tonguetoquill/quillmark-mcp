# Phase 5: MCP Server (QuillmarkMCP)

## Goal

Implement the `QuillmarkMCP` class that wires the three primitives (`listQuills`, `getSpecs`, `createDocument`) as MCP tools using `fastmcp@3.35`. The class owns the registry and engine lifecycle and exposes a one-liner server start.

## Context from PROGRAM.md

### MCP Server
- `QuillmarkMCP` class wires registry + strategy + fastmcp. One-liner to start a server.
- The MCP class is built from the primitives and owns the registry/engine lifecycle.
- `@quillmark/wasm` and quills initialize eagerly at startup using `FileSystemSource` from `@quillmark/registry`.

### Tools (MCP surface)
Three tools, each with **static tool-level instructions** baked into their MCP descriptions:

1. **list_quills**: Name and description for each available quill. Call only when the agent doesn't know which quill to use. Never throws; returns empty list if no quills available.
2. **get_specs**: Schema and authoring instructions for a quill. Throws if quill reference is invalid.
3. **create_document**: Input is `content` (string with YAML frontmatter + markdown body). `QUILL:` must be in frontmatter. Returns `{ status, url?, errors? }`.

### Tool Instructions
- Static tool-level instructions go in the MCP tool descriptions (how to use the tool).
- Dynamic per-quill instructions come from the quill via `getSpecs` (not embedded in tool descriptions).

## Prerequisites

Phases 1-4 complete: all three primitives and both delivery strategies implemented and tested.

## Tasks

### 1. Explore the fastmcp@3.35 API

Inspect the fastmcp package to understand:
- How to create an MCP server instance
- How to register tools (method signature, description, parameters schema, handler)
- How to start/stop the server
- How input parameters are defined (Zod schemas, JSON Schema, or something else)

```bash
node -e "import('fastmcp').then(m => console.log(Object.keys(m)))"
```

Read relevant files under `node_modules/fastmcp` to learn the API.

### 2. Implement QuillmarkMCP

Create `src/mcp/QuillmarkMCP.js`:

```js
import { FastMCP } from 'fastmcp'; // adjust based on actual API
import { listQuills, getSpecs, createDocument } from '../primitives/index.js';

export class QuillmarkMCP {
  /**
   * @param {object} options
   * @param {string} options.quillsDir - Path to quill files directory
   * @param {DeliveryStrategy} options.strategy - Delivery strategy instance
   */
  constructor(options) {
    // 1. Create registry using FileSystemSource from @quillmark/registry
    // 2. Store strategy
    // 3. Create fastmcp server instance
    // 4. Register tools
  }

  async start() {
    // 1. Initialize @quillmark/wasm eagerly
    // 2. Load quills into registry
    // 3. Start the MCP server
  }
}
```

### 3. Register MCP tools

Register three tools on the fastmcp instance with static descriptions:

**list_quills**:
- Description: "List available Quills with names and descriptions. Call this when you need to discover which Quill to use. Returns an array of { name, description } objects. Returns an empty list if no Quills are available."
- Parameters: none
- Handler: calls `listQuills(registry)` and returns the result

**get_specs**:
- Description: "Get the schema and authoring instructions for a specific Quill. Returns a TOON-encoded schema (token-efficient for LLM consumption) and authoring instructions from the Quill itself. Use the returned schema to structure your content and follow the authoring instructions for content guidance."
- Parameters: `{ ref: string }` — the quill reference identifier
- Handler: calls `getSpecs(registry, ref)` and returns the result

**create_document**:
- Description: "Create a document from Quillmark content. Input must be a string containing YAML frontmatter with a QUILL: field and a markdown body. If QUILL: is missing from frontmatter, returns an error with guidance — fix the content and retry. Returns { status, url?, errors? }."
- Parameters: `{ content: string }` — full Quillmark document
- Handler: calls `createDocument(registry, strategy, content)` and returns the result

### 4. Create MCP barrel

Create `src/mcp/index.js`:

```js
export { QuillmarkMCP } from './QuillmarkMCP.js';
```

### 5. Write unit tests

Create `test/mcp/QuillmarkMCP.test.js`:

Test cases:
1. **Constructor creates instance** — instantiate with mock options; assert no errors.
2. **list_quills tool is registered** — verify the tool exists on the server with correct name and description.
3. **get_specs tool is registered** — verify tool exists with correct parameter schema.
4. **create_document tool is registered** — verify tool exists with correct parameter schema.
5. **Tool handlers delegate to primitives** — invoke each tool handler; assert the corresponding primitive is called with correct arguments.

Strategy for testing: either mock the fastmcp server to inspect registrations, or use fastmcp's testing utilities if available. If fastmcp exposes a way to list registered tools or invoke them programmatically, use that.

## Verification

```bash
# All tests pass (Phases 1-5)
npm test

# QuillmarkMCP is importable
node -e "import('./src/mcp/index.js').then(m => console.log(typeof m.QuillmarkMCP))"
# Expected output: "function"

# Server can be instantiated (dry run — doesn't need real quills)
# This may require a mock or a quills directory with at least a test fixture
```

## Files Created / Modified

| File | Action |
|---|---|
| `src/mcp/QuillmarkMCP.js` | created |
| `src/mcp/index.js` | created |
| `test/mcp/QuillmarkMCP.test.js` | created |

## What NOT to Do

- Do not add configuration for transports, authentication, or logging — keep it minimal.
- Do not embed per-quill authoring instructions in tool descriptions — those come dynamically from `getSpecs`.
- Do not create a CLI argument parser — the entry point (Phase 6) handles that.
- Do not add middleware, rate limiting, or error-handling wrappers beyond what fastmcp provides.

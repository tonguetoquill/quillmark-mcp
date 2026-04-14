# MCP Tools

Quillmark exposes its capabilities as MCP tools registered by `QuillmarkMCP`. There are 3 tools in the default configuration, plus a 4th gated behind `QUILLMARK_LOCAL_MODEL_MODE=1`.

**Source:** `src/mcp/QuillmarkMCP.js`, `src/primitives/`

---

## Tool Registration

Tools are registered at `QuillmarkMCP` construction time. Each tool definition has:

- **name** — unique identifier on the MCP wire
- **description** — LLM-facing prompt text
- **parameters** — Zod schema (omitted when the tool takes no input)
- **execute** — async function that delegates to the primitives layer

All tool execute handlers catch errors and surface them as structured responses or re-throw for the adapter's result wrapper (see [MCP-Server](MCP-Server.md#tool-result-wrapping)).

---

## 1. list_quills

Discover available Quill formats (document templates).

### Parameters

None.

### Return Shape

```json
[
  { "name": "usaf_memo", "description": "Official USAF Memorandum format" },
  { "name": "usaf_letter", "description": "USAF Official Letter" }
]
```

An array of `{ name: string, description: string }` objects. Descriptions are normalized to strings — missing or non-string descriptions become `""`.

### Error Handling

**Non-throwing by design.** Registry failures (network, WASM init, corrupt packages) are swallowed and produce an empty array `[]`. This guarantees the MCP tool always returns a valid response.

### Example

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "list_quills",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"name\":\"usaf_memo\",\"description\":\"Official USAF Memorandum format\"}]"
    }
  ]
}
```

---

## 2. get_specs

Retrieve the schema and authoring instructions for a specific Quill format. The schema is encoded in [TOON format](https://github.com/nicktomlin/toon) — a token-efficient serialization designed for LLM consumption.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `ref` | `z.string()` | Yes | Quill format identifier, e.g. `"usaf_memo"` or `"usaf_memo@1.0.0"` |

### Return Shape

```json
{
  "schema": "QUILL s\nDATE s\nFROM s\nTO s\n...",
  "instructions": "Write a formal memorandum following AF formatting..."
}
```

- **schema** — TOON-encoded representation of the Quill's frontmatter schema. Compact and token-efficient for LLM context windows.
- **instructions** — Authoring guidance bundled with the Quill. Fallback chain: `quillInfo.example` (preferred) -> `quillInfo.metadata.instructions` -> `""`.

### Error Cases

This tool **throws** on every failure path (callers see an MCP error response):

| Condition | Error Message |
|---|---|
| Empty or non-string `ref` | `"Quill format reference must be a non-empty string."` |
| Resolution failure | `"Unable to resolve Quill format reference \"<ref>\": <cause>"` |
| No WASM engine | `"Registry does not have an attached wasm engine with a getQuillInfo method."` |

### Example

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_specs",
    "arguments": { "ref": "usaf_memo" }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"schema\":\"QUILL s\\nDATE s\\nFROM s\\nTO s\",\"instructions\":\"Write a formal memorandum...\"}"
    }
  ],
  "structuredContent": {
    "schema": "QUILL s\nDATE s\nFROM s\nTO s",
    "instructions": "Write a formal memorandum..."
  }
}
```

Note: `structuredContent` is included because the return value is a plain object.

---

## 3. create_document

Create a document from raw Quillmark content (YAML frontmatter + markdown body). This is the primary rendering tool.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `content` | `z.string()` | Yes | Full Quillmark document: `---` delimited YAML frontmatter (must include `QUILL:` field) followed by markdown body |

### Input Format

```yaml
---
QUILL: usaf_memo
DATE: "2026-04-11"
FROM: "673 ABW/CC"
TO: "All Personnel"
SUBJECT: "Spring Safety Stand-Down"
---

1. References. AFI 91-202, The US Air Force Mishap Prevention Program.

2. Purpose. This memorandum directs all units to conduct a safety stand-down...
```

### Return Shape

**Success:**
```json
{
  "status": "success",
  "url": "http://localhost:8080/artifacts/usaf_memo-a1b2c3d4.pdf"
}
```

**Error:**
```json
{
  "status": "error",
  "errors": [
    { "message": "QUILL: is required in frontmatter to select the Quill format." }
  ]
}
```

### Pipeline

1. Validate `content` is a non-empty string
2. Parse frontmatter (naive `key: value` splitter, not a full YAML parser)
3. Extract `QUILL` key (case-insensitive, strips surrounding quotes)
4. Resolve the Quill ref against the registry
5. Run WASM engine dry-run validation (schema + business rules)
6. Delegate to the delivery strategy for rendering and persistence

### Error Cases

**Non-throwing by design.** Every failure returns a structured error response:

| Condition | Error Message |
|---|---|
| Empty or non-string content | `"Content must be a non-empty string."` |
| Missing `QUILL:` in frontmatter | `"QUILL: is required in frontmatter to select the Quill format."` |
| Quill ref resolution failure | `"Unable to resolve Quill format reference \"<ref>\": <cause>"` |
| WASM validation failure | Engine-specific message (may come from a `Map` of per-field errors) |
| Strategy/render failure | Strategy-specific message |

Error messages from `Map` objects (common in WASM validation) are serialized via `getErrorMessage()` — if the Map has a `message` key it uses that; otherwise it joins all entries as `"key: value; key: value"`.

### Example

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "create_document",
    "arguments": {
      "content": "---\nQUILL: usaf_memo\nDATE: \"2026-04-11\"\nFROM: \"673 ABW/CC\"\n---\n\nBody text here."
    }
  }
}
```

**Response (success):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"status\":\"success\",\"url\":\"file:///path/to/.artifacts/usaf_memo-uuid.pdf\"}"
    }
  ],
  "structuredContent": {
    "status": "success",
    "url": "file:///path/to/.artifacts/usaf_memo-uuid.pdf"
  }
}
```

---

## 4. compose_document (Local Model Mode Only)

Compose and render a document from structured fields. The server assembles the YAML frontmatter from a JSON object so the client does not need to emit raw YAML.

### Gating Logic

This tool is **only registered** when `QUILLMARK_LOCAL_MODEL_MODE=1` (passed as `localModelMode: true` to `QuillmarkMCP`).

**Why it exists:** Small local models (e.g., Ollama 7B/13B variants) consistently fumble raw YAML generation — they misplace delimiters, botch quoting, produce invalid indentation, or forget the `QUILL:` key entirely. `compose_document` eliminates that failure mode by accepting structured JSON parameters and assembling the YAML server-side.

**Why it is gated:** Hosted-model clients (Claude Code, Claude Desktop, ChatGPT, etc.) handle YAML reliably. Exposing a 4th tool to those clients adds unnecessary surface area, changes the tool contract, and can confuse model routing. The gate keeps the default experience clean (3 tools) while providing a lifeline for weaker models on a separate endpoint.

```js
// In QuillmarkMCP constructor:
if (this.localModelMode) {
  this.server.addTool({
    name: 'compose_document',
    // ...
  });
}
```

To enable, set the environment variable before starting the server:

```bash
QUILLMARK_LOCAL_MODEL_MODE=1 npx quillmark-mcp
```

Or in Docker Compose:

```yaml
environment:
  QUILLMARK_LOCAL_MODEL_MODE: "1"
```

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `quill` | `z.string()` | Yes | Quill format name, e.g. `"usaf_memo"`. Call `get_specs` first to learn which fields the Quill requires. |
| `fields` | `z.record(z.string(), z.any())` | Yes | JSON object of frontmatter fields. Keys match the schema from `get_specs`. Values can be strings, numbers, booleans, arrays, or nested objects. **Do not** include a `QUILL` key here — use the `quill` parameter. |
| `body` | `z.string()` | Yes | Markdown body content. Do not include YAML delimiters or frontmatter fields — only the body below the `---`. |

### How It Works

`compose_document` delegates to the same `createDocument` primitive as `create_document`. The only difference is a preprocessing step that assembles the Quillmark content string:

```js
// composeContent from src/primitives/composeYaml.js
const content = composeContent({ quill, fields, body });
// content is now: "---\nQUILL: \"usaf_memo\"\nDATE: ...\n---\n\nBody..."
const result = await createDocument(this.registry, this.strategy, content);
```

The `composeContent` function:

1. Injects `QUILL: <quill>` as the first frontmatter field (overrides any `QUILL` key in `fields`)
2. Emits each field as valid YAML using `toYamlBlock()`:
   - Strings are JSON-escaped double-quoted scalars
   - Arrays use block-style (`- item`) for readability
   - Nested objects use flow-style JSON (valid YAML 1.2)
   - `null`, booleans, and numbers are emitted directly
3. Wraps the result in `---` delimiters with the body appended

There is only **one rendering path** — `compose_document` produces a content string and feeds it through the exact same `createDocument` pipeline. No divergence in behavior.

### Return Shape

Identical to `create_document`:

**Success:**
```json
{
  "status": "success",
  "url": "http://localhost:8080/artifacts/usaf_memo-a1b2c3d4.pdf"
}
```

**Error:**
```json
{
  "status": "error",
  "errors": [
    { "message": "Unable to resolve Quill format reference \"bad_name\": ..." }
  ]
}
```

### Error Cases

Same as `create_document` — all errors from the shared pipeline surface identically.

### Example

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "compose_document",
    "arguments": {
      "quill": "usaf_memo",
      "fields": {
        "DATE": "2026-04-11",
        "FROM": "673 ABW/CC",
        "TO": "All Personnel",
        "SUBJECT": "Spring Safety Stand-Down",
        "DISTRIBUTION": ["673 ABW/All", "3 WG/CC", "477 FG/CC"]
      },
      "body": "1. References. AFI 91-202.\n\n2. Purpose. This memorandum directs..."
    }
  }
}
```

The server assembles this into:

```yaml
---
QUILL: "usaf_memo"
DATE: "2026-04-11"
FROM: "673 ABW/CC"
TO: "All Personnel"
SUBJECT: "Spring Safety Stand-Down"
DISTRIBUTION:
  - "673 ABW/All"
  - "3 WG/CC"
  - "477 FG/CC"
---

1. References. AFI 91-202.

2. Purpose. This memorandum directs...
```

**Response (success):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"status\":\"success\",\"url\":\"file:///path/to/.artifacts/usaf_memo-uuid.pdf\"}"
    }
  ],
  "structuredContent": {
    "status": "success",
    "url": "file:///path/to/.artifacts/usaf_memo-uuid.pdf"
  }
}
```

---

## Tool Summary

| Tool | Params | Returns | Throws? | Gated? |
|---|---|---|---|---|
| `list_quills` | *(none)* | `[{name, description}]` | No (returns `[]`) | No |
| `get_specs` | `{ref}` | `{schema, instructions}` | Yes | No |
| `create_document` | `{content}` | `{status, url?, errors?}` | No (structured errors) | No |
| `compose_document` | `{quill, fields, body}` | `{status, url?, errors?}` | No (structured errors) | `QUILLMARK_LOCAL_MODEL_MODE=1` |

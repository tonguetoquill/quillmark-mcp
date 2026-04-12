# Error Handling

Comprehensive reference for how Quillmark MCP surfaces, structures, and recovers from errors across the tool and primitive layers.

## Design Principle

All primitives return **structured error objects** rather than throwing exceptions. The MCP protocol has no concept of exceptions on the wire -- errors must be expressed as tool results. The only exception to this rule is `getSpecs`, which throws `Error` because its failure modes are unrecoverable configuration issues (bad ref, missing WASM engine) that the caller must handle explicitly.

```
// Primitives that return structured errors (never throw):
createDocument(registry, strategy, content)  ->  { status: 'error', errors: [...] }
listQuills(registry)                         ->  []  (empty array on any failure)

// Primitive that throws:
getSpecs(registry, ref)                      ->  throws Error
```

## Structured Error Format

Every error response from `createDocument` and `compose_document` uses this shape:

```json
{
  "status": "error",
  "errors": [
    { "message": "Human-readable description of what went wrong." }
  ]
}
```

- `status` is always the string `"error"`.
- `errors` is a non-empty array of objects, each with a `message` string.
- Success responses use `{ "status": "success", "url": "..." }` -- no `errors` key.

## Error Sources

Every error that can surface from the tool layer originates in one of five pipeline stages:

| Stage | Source | Example Error | Returns / Throws |
|---|---|---|---|
| **Input validation** | `createDocument` guard | `"Content must be a non-empty string."` | Returns structured error |
| **Frontmatter parsing** | `parseFrontmatter` + `extractQuillRef` | `"QUILL: is required in frontmatter to select the Quill format."` | Returns structured error |
| **QUILL resolution** | `registry.resolve(ref)` | `"Unable to resolve Quill format reference \"bad-ref\": ..."` | Returns structured error |
| **Schema validation** | `engine.dryRun(content)` via `validateWithEngine` | Field-level validation messages from WASM engine | Returns structured error |
| **Rendering / Strategy** | `strategy.handle(quill, content)` | `"Render result did not include any artifacts."` | Returns structured error |

For `getSpecs`, the failure modes are:

| Stage | Source | Example Error | Behaviour |
|---|---|---|---|
| **Input validation** | `getSpecs` guard | `"Quill format reference must be a non-empty string."` | Throws `Error` |
| **QUILL resolution** | `registry.resolve(ref)` | `"Unable to resolve Quill format reference \"bad-ref\": ..."` | Throws `Error` (with `cause`) |
| **Missing engine** | Engine check | `"Registry does not have an attached wasm engine with getStrippedSchema/getQuillInfo methods."` | Throws `Error` |

## getErrorMessage() Utility

Both `createDocument` and `RenderAndHostStrategy` use a `getErrorMessage(error)` function to coerce arbitrary thrown values into readable strings. The WASM engine can throw non-standard types, so this function handles all of them:

| Input Type | Handling |
|---|---|
| `Error` instance | Returns `error.message` |
| `Map` with `"message"` key | Returns `String(error.get("message"))` |
| `Map` without `"message"` key | Serializes all entries: `"key1: val1; key2: val2"` |
| Plain object | `JSON.stringify(error)`, falls back to `String(error)` |
| Primitive (string, number, etc.) | `String(error)` |

Map handling is critical because the WASM validation engine surfaces per-field errors as `Map` entries where keys are field names and values are error messages.

## Tool-Level Error Behaviour

### list_quills

**Never errors.** The primitive wraps all failures in a `try/catch` and returns `[]` on any exception. Registry network failures, WASM init errors, and corrupt packages all produce an empty array rather than a tool error.

### get_specs

**Throws `Error`** on every failure path:

- Empty or non-string `ref` argument
- Resolution failure (unknown quill name, network error, version mismatch)
- Missing or incomplete WASM engine (no `getStrippedSchema` or `getQuillInfo` methods)

The MCP tool handler in `QuillmarkMCP` catches these throws and re-throws them, which the `McpSdkServerAdapter` serializes as MCP-level error responses.

### create_document

**Returns structured errors** for all failure modes. Never throws. The pipeline short-circuits at the first failure:

1. Content is not a non-empty string -> error
2. No `QUILL:` key in frontmatter -> error
3. `registry.resolve()` rejects -> error (with ref and cause in message)
4. `engine.dryRun()` throws -> error (validation failures from WASM)
5. `strategy.handle()` returns an error result -> error (rendering/IO failures)

After step 5, any error objects with Map or non-string messages in the `errors` array are re-serialized through `getErrorMessage()` to guarantee string messages in the response.

### compose_document

**Same error behaviour as `create_document`.** It assembles YAML from structured `{ quill, fields, body }` params via `composeContent()`, then delegates to `createDocument()`. All error handling is inherited from the `createDocument` pipeline.

The `composeContent()` assembly step itself is defensive: non-object `fields` are treated as `{}`, non-string `body` becomes `""`. The `toYamlBlock()` function throws `TypeError` on non-object input, but `composeContent` guards against this upstream.

## Agent Recovery Guidance

When `create_document` returns an error, follow this decision tree:

### 1. Missing or invalid QUILL field

**Error message pattern:** `"QUILL: is required in frontmatter..."` or `"Unable to resolve Quill format reference..."`

**Recovery:**
1. Call `list_quills` to get available format names.
2. Pick the correct quill name.
3. Call `get_specs` with that name to get the schema and authoring instructions.
4. Rebuild the document with a valid `QUILL:` field in frontmatter.
5. Retry `create_document`.

### 2. Schema validation failure

**Error message pattern:** Field-level messages from the WASM engine (e.g., `"subject: required field"`, `"date: invalid format"`)

**Recovery:**
1. Call `get_specs` with the quill ref from your document to get the current schema.
2. Compare your frontmatter fields against the schema requirements.
3. Fix missing, misspelled, or incorrectly typed fields.
4. Retry `create_document`.

### 3. Rendering failure

**Error message pattern:** `"Render result did not include any artifacts."` or WASM-level render errors

**Recovery:**
1. Verify the document content is well-formed (frontmatter + body).
2. Check that the quill format supports the configured output format.
3. Retry. If persistent, this may indicate a bug in the quill definition or WASM engine.

### 4. Strategy / IO failure

**Error message pattern:** File system errors, permission errors

**Recovery:**
1. This is an infrastructure issue (disk full, permissions, missing output directory).
2. Check server logs (`LOG_LEVEL=debug`) for the underlying cause.
3. Not recoverable by changing document content -- requires operator intervention.

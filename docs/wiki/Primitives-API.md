# Primitives API Reference

The primitives layer (`src/primitives/`) exposes the three core operations that MCP tool handlers delegate to, plus two YAML assembly utilities. All primitives accept a `registry` as their first argument and are strategy-agnostic -- the persistence mechanism is injected, never owned.

Barrel export: `src/primitives/index.js` re-exports `listQuills`, `getSpecs`, and `createDocument`.

---

## `listQuills(registry)`

Enumerates installed Quill formats (document templates) from the registry.

**Non-throwing by design.** Registry failures (network errors, WASM init failures, corrupt packages) are swallowed and produce an empty array so the MCP tool layer always returns a valid response.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `registry` | `object` | Package registry. Must expose `getAvailableQuills()` returning `Promise<Array<{ name, description }>>`. |

### Returns

`Promise<Array<{ name: string, description: string }>>`

Each entry has a normalized `description` -- missing or non-string descriptions become `''` to guarantee a uniform shape for downstream consumers.

Returns `[]` on any error.

### Edge Cases

- If `registry.getAvailableQuills()` rejects, returns `[]` (never throws).
- If a quill's `description` is `null`, `undefined`, a number, or any non-string, it is coerced to `''`.

### Example

```js
import { listQuills } from './primitives/index.js';

const quills = await listQuills(registry);
// [{ name: 'memo', description: 'Standard memorandum' }, ...]

// Registry down? Still safe:
const quills = await listQuills(brokenRegistry);
// []
```

---

## `getSpecs(registry, ref, deps?)`

Resolves a Quill format reference and returns its schema (TOON-encoded) plus authoring instructions for LLM consumption.

The schema is encoded via **TOON** (a compact, token-efficient serialisation format) so it fits within LLM context windows without wasting tokens on JSON verbosity. The encoder can be overridden via `deps.encodeSchema` for testing or alternative formats.

**Throwing by design.** Every failure path throws -- callers are expected to catch and surface errors to the user.

### Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `registry` | `object` | -- | Package registry with an attached WASM engine. Must expose `resolve(ref)` returning `Promise<{ name }>`, and `engine` with `getStrippedSchema(name)` and `getQuillInfo(name)`. |
| `ref` | `string` | -- | Quill format identifier (e.g. `'memo'` or `'memo@1.2.0'`). |
| `deps` | `object` | `{}` | Injectable dependencies. May include `encodeSchema(schema)` to override the default TOON encoder. |

### Returns

```ts
Promise<{ schema: string, instructions: string }>
```

- `schema` -- TOON-encoded schema object from `engine.getStrippedSchema(name)`.
- `instructions` -- Authoring instructions extracted via `extractInstructions` (see below).

### Throws

| Condition | Error message |
|-----------|---------------|
| `ref` is not a string or is empty/whitespace | `'Quill format reference must be a non-empty string.'` |
| `registry.resolve(ref)` rejects | `'Unable to resolve Quill format reference "<ref>": <cause>'` (wraps original as `cause`) |
| Registry lacks a WASM engine with required methods | `'Registry does not have an attached wasm engine with getStrippedSchema/getQuillInfo methods.'` |

### `extractInstructions` Fallback Chain (internal)

Used internally to extract authoring guidance from the resolved quill's metadata:

1. `quillInfo.example` (preferred) -- typically a full sample document
2. `quillInfo.metadata.instructions` -- prose guidance
3. `''` -- empty string if neither is available

The example takes priority when both exist.

### Example

```js
import { getSpecs } from './primitives/index.js';

try {
  const { schema, instructions } = await getSpecs(registry, 'memo');
  // schema: TOON-encoded string
  // instructions: sample document or prose guidance
} catch (err) {
  console.error(err.message);
  // "Unable to resolve Quill format reference "bad-ref": Not found"
}

// Override the encoder for testing:
const { schema } = await getSpecs(registry, 'memo', {
  encodeSchema: (obj) => JSON.stringify(obj),
});
```

---

## `createDocument(registry, strategy, content)`

The main pipeline. Validates and persists a Quillmark document through five stages:

1. Validate `content` is a non-empty string
2. Parse frontmatter and extract the `QUILL` reference
3. Resolve the QUILL ref against the registry
4. Run WASM engine dry-run validation (schema + business rules)
5. Delegate to the injected strategy for persistence

**Non-throwing by design.** Every failure is returned as a structured `{ status: 'error', errors: [...] }` response rather than a thrown exception. This is intentional -- MCP tool handlers should never throw because the protocol has no concept of exceptions.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `registry` | `object` | Package registry. Must expose `resolve(ref)` returning a Promise. Optionally `engine.dryRun(content)` for validation. |
| `strategy` | `object` | Persistence strategy. Must expose `handle(quill, validatedContent)` returning a Promise. |
| `content` | `string` | Full Quillmark document: YAML frontmatter (with `QUILL:` key) + markdown body. |

### Returns

```ts
Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }>
```

On success, the return value is whatever `strategy.handle()` produces (typically `{ status: 'success', url: '...' }`).

On failure at any stage:

```js
{ status: 'error', errors: [{ message: '...' }] }
```

Error messages from `Map` objects (WASM validation), plain objects, and primitives are all serialized to strings via `getErrorMessage`.

### Error Responses (by pipeline stage)

| Stage | Condition | Error message |
|-------|-----------|---------------|
| 1 | `content` is not a string or is empty | `'Content must be a non-empty string.'` |
| 2 | No `QUILL:` key in frontmatter | `'QUILL: is required in frontmatter to select the Quill format.'` |
| 3 | `registry.resolve()` rejects | `'Unable to resolve Quill format reference "<ref>": <cause>'` |
| 4 | `engine.dryRun()` throws | Validation error message(s) from the WASM engine |
| 5 | Strategy returns `{ status: 'error' }` | Passed through with error messages re-serialized |

### Edge Cases

- The `QUILL` key lookup is **case-insensitive**: `quill:`, `Quill:`, `QUILL:` all work.
- YAML quotes around the ref are stripped: `QUILL: "memo"` resolves as `memo`.
- If the registry has no WASM engine (`engine` is missing or lacks `dryRun`), validation is **skipped** (returns no errors), and the pipeline proceeds to the strategy.
- Strategy errors with `Map`-typed messages are serialized to `"key: value; key2: value2"` strings.

### Example

```js
import { createDocument } from './primitives/index.js';

const result = await createDocument(registry, strategy, `---
QUILL: memo
to: "Commander, 673 ABW"
subject: "Quarterly Review"
---

Body text here.
`);

if (result.status === 'error') {
  console.error(result.errors); // [{ message: '...' }]
} else {
  console.log(result.url); // file:///path/to/memo-<uuid>.pdf
}
```

---

## `composeContent({ quill, fields, body })`

Assembles a full Quillmark content string from structured parts. The `QUILL` field is injected as the **first** frontmatter entry, overriding any existing `QUILL` key in `fields` -- the `quill` parameter is authoritative.

### Parameters

Accepts a single object:

| Property | Type | Description |
|----------|------|-------------|
| `quill` | `string` | Quill format reference. Injected as `QUILL:` in frontmatter. |
| `fields` | `object` (optional) | Additional frontmatter key-value pairs. Any `QUILL` key here is discarded. |
| `body` | `string` | Markdown body content below the frontmatter. |

### Returns

`string` -- Complete Quillmark document with `---` delimiters.

### Edge Cases

- Non-object `fields` (null, arrays, primitives) are silently treated as `{}`.
- Non-string `body` becomes `''`.
- Any `QUILL` key in `fields` is stripped and replaced by the `quill` parameter.

### Example

```js
import { composeContent } from './primitives/composeYaml.js';

const doc = composeContent({
  quill: 'memo',
  fields: { to: 'HQ', subject: 'Test', QUILL: 'ignored' },
  body: 'This is the body.',
});

// Output:
// ---
// QUILL: "memo"
// to: "HQ"
// subject: "Test"
// ---
//
// This is the body.
```

---

## `toYamlBlock(fields)`

Minimal JSON-to-YAML block-style emitter. Converts a flat JS object into a YAML body string (without `---` delimiters).

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `fields` | `object` | Plain object whose entries become YAML key-value pairs. |

### Returns

`string` -- YAML body without delimiters.

### Throws

| Condition | Error |
|-----------|-------|
| `fields` is `null`, an array, or a non-object primitive | `TypeError('toYamlBlock expects a plain object')` |

### Value Encoding Rules

| Input type | YAML output |
|------------|-------------|
| `string` | Double-quoted via `JSON.stringify` (e.g. `"hello"`) |
| `number`, `boolean` | Literal (e.g. `42`, `true`) |
| `null`, `undefined` | `null` |
| `Array` (empty) | `[]` |
| `Array` (non-empty) | Block-style (`- item` per element) |
| Nested `object` | Flow-style JSON (e.g. `{"a": 1}`) |
| `undefined` value | Field omitted entirely |

### Example

```js
import { toYamlBlock } from './primitives/composeYaml.js';

toYamlBlock({ name: 'test', count: 3, tags: ['a', 'b'] });
// name: "test"
// count: 3
// tags:
//   - "a"
//   - "b"

toYamlBlock(null);
// TypeError: toYamlBlock expects a plain object
```

---

## Internal Helpers

These functions are not exported but are used within the primitives layer.

### `parseFrontmatter(content)`

**Location:** `src/primitives/createDocument.js`

Extracts YAML frontmatter fields from a Quillmark document string. Uses a regex to match the `---`-delimited block at the start, then parses line-by-line with a naive `key: value` splitter. This is **not** a full YAML parser -- it handles flat key-value pairs only.

- Comment lines (starting with `#`) and blank lines are skipped.
- Returns `{}` if no frontmatter block is found.
- Regex: `/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/`

### `stripYamlQuotes(value)`

**Location:** `src/primitives/createDocument.js`

Strips surrounding flow-style YAML quotes (single or double) from a string value. Only affects the naive pre-extraction path used by `extractQuillRef` -- the real WASM YAML parser handles quoting on its own.

- `"memo"` becomes `memo`
- `'memo'` becomes `memo`
- Non-strings returned as-is.
- Only strips if `value.length >= 2` and quotes are matched (both single or both double).

### `extractQuillRef(frontmatterFields)`

**Location:** `src/primitives/createDocument.js`

Case-insensitive lookup of the `QUILL` key in parsed frontmatter fields. Returns the quote-stripped value, or `undefined` if not present.

- `{ quill: 'memo' }` -> `'memo'`
- `{ QUILL: '"memo"' }` -> `'memo'`
- `{ title: 'Test' }` -> `undefined`

### `validateWithEngine(registry, content)`

**Location:** `src/primitives/createDocument.js`

Runs the WASM engine's `dryRun` validation against the full document content. Non-throwing: returns `[]` on success (or if no engine is available), and `[{ message }]` on validation failure.

- If `registry.engine` is missing or lacks `dryRun`, returns `[]` (validation skipped).
- Catches all errors from `dryRun` and wraps them via `getErrorMessage`.

### `getErrorMessage(error)`

**Location:** `src/primitives/createDocument.js` (also duplicated in `src/strategies/RenderAndHostStrategy.js`)

Coerces arbitrary error values into human-readable strings. Handles:

| Input type | Behavior |
|------------|----------|
| `Error` | Returns `.message` |
| `Map` with `'message'` key | Returns `String(map.get('message'))` |
| `Map` without `'message'` key | Serializes as `"key1: val1; key2: val2"` |
| Plain object | `JSON.stringify(error)` (falls back to `String(error)` if stringify throws) |
| Primitive | `String(error)` |

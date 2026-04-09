# Phase 3: getSpecs Primitive

## Goal

Implement the `getSpecs(registry, ref)` primitive — retrieves a quill's JSON Schema via `@quillmark/wasm`, converts it to TOON format via `@toon-format/toon`, and returns the result along with authoring instructions. Include unit tests.

## Context from PROGRAM.md

- `getSpecs(registry, ref)` returns TOON-encoded schema + authoring instructions for a quill.
- `@quillmark/wasm` returns the JSON Schema for a quill.
- `@toon-format/toon` encodes JSON schemas into a token-efficient format for LLM consumers.
- **Throws** if the quill reference is invalid or unavailable.
- Two kinds of instructions:
  - **Static tool-level**: baked into the primitive (how to use the tool) — surfaced as MCP tool descriptions (not part of this function's return).
  - **Dynamic per-quill**: authoring guidance from the quill itself via `@quillmark/wasm`. This function formats and passes through — no opinions injected.

## Prerequisites

Phase 2 complete: `listQuills` implemented and tested, `src/primitives/index.js` barrel exists.

## Tasks

### 1. Explore the @quillmark/wasm and @toon-format/toon APIs

Inspect both packages to understand:

**@quillmark/wasm**:
- How to get a quill's JSON Schema from a registry + ref
- How to get authoring instructions / guidance from a quill
- Method signatures and return types

**@toon-format/toon**:
- How to encode a JSON Schema object into TOON format
- Method signature (e.g., `encode(schema)` or `toToon(schema)`)

```bash
node -e "import('@quillmark/wasm').then(m => console.log(Object.keys(m)))"
node -e "import('@toon-format/toon').then(m => console.log(Object.keys(m)))"
```

Read relevant source/type files to understand the API surfaces.

### 2. Implement getSpecs

Create `src/primitives/getSpecs.js`:

```js
/**
 * @param {Registry} registry
 * @param {string} ref - Quill reference identifier
 * @returns {{ schema: string, instructions: string }} TOON-encoded schema + authoring instructions
 * @throws {Error} If the quill reference is invalid or unavailable
 */
export function getSpecs(registry, ref) {
  // 1. Resolve the quill from registry using ref
  // 2. Get JSON Schema from @quillmark/wasm
  // 3. Get authoring instructions from @quillmark/wasm
  // 4. Encode schema to TOON via @toon-format/toon
  // 5. Return { schema: toonEncodedSchema, instructions }
}
```

Requirements:
- Accept registry and a quill reference string.
- Use `@quillmark/wasm` to get the JSON Schema and authoring instructions.
- Use `@toon-format/toon` to encode the schema.
- **Throw** a clear error if the ref is invalid or the quill is unavailable.
- Pass through authoring instructions as-is — do not inject tool-usage opinions.
- The function may be `async` if the underlying APIs require it.

### 3. Write unit tests

Create `test/primitives/getSpecs.test.js`:

Test cases:
1. **Returns TOON-encoded schema and instructions for a valid ref** — mock the registry and wasm calls; assert return shape and that TOON encoding was applied.
2. **Throws for an invalid/unknown ref** — mock registry to indicate quill not found; assert the function throws with a meaningful message.
3. **Throws when registry itself errors** — mock registry that throws; assert the error propagates (unlike `listQuills`, this function is not swallowed).
4. **Instructions are passed through unmodified** — mock wasm to return known instructions; assert they come back unchanged.

Mock `@quillmark/wasm` and `@toon-format/toon` — do not require real quill files or real WASM execution.

### 4. Update primitives barrel

Update `src/primitives/index.js` to add the export:

```js
export { listQuills } from './listQuills.js';
export { getSpecs } from './getSpecs.js';
```

## Verification

```bash
# All tests pass (including Phase 2 tests)
npm test

# Function is importable
node -e "import('./src/primitives/index.js').then(m => console.log(typeof m.getSpecs))"
# Expected output: "function"
```

## Files Created / Modified

| File | Action |
|---|---|
| `src/primitives/getSpecs.js` | created |
| `src/primitives/index.js` | modified (add getSpecs export) |
| `test/primitives/getSpecs.test.js` | created |

## What NOT to Do

- Do not hardcode schemas or instructions — always delegate to the library APIs.
- Do not catch and swallow errors — this function intentionally throws on bad input.
- Do not embed tool-usage instructions in the return value (that belongs in MCP tool descriptions, Phase 5).

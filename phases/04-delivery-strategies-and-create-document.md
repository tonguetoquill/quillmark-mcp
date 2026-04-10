# Phase 4: Delivery Strategies & createDocument Primitive

## Goal

Define the delivery strategy abstraction, implement two concrete strategies (`PassThroughStrategy` and `RenderAndHostStrategy`), and implement the `createDocument(registry, strategy, content)` primitive. Include unit tests for all.

## Context from PROGRAM.md

### createDocument
- **Input**: `content` — a string with YAML frontmatter and markdown body. `QUILL:` must be present in frontmatter.
- **Returns**: `{ status, url?, errors? }`
- Validates content, parses the quill reference from frontmatter, then delegates to a delivery strategy.
- If `QUILL:` is missing from frontmatter, returns a structured error for agent self-repair (does not throw).

### Delivery Strategy (abstract)
```
validate(quill, content) → strategy.handle(quill, validatedContent) → { status, url?, errors? }
```
- Validation is always in the core path (inside `createDocument`, not the strategy).
- The strategy decides rendering, hosting, delegation, etc.
- Constructor injection — strategy is passed in, not created internally.

### Concrete Strategies
- **PassThroughStrategy**: sends structured content to a consumer's service, which renders and returns a URL.
- **RenderAndHostStrategy**: renders via `@quillmark/wasm`, serves the artifact, returns a download URL. The plug-and-play example (PDF download).

## Prerequisites

Phases 1-3 complete: project scaffolded, `listQuills` and `getSpecs` implemented and tested.

## Tasks

### 1. Explore content parsing needs

Determine how to parse YAML frontmatter from a markdown string. Options:
- Use a lightweight frontmatter parser (if already a transitive dependency)
- Write a minimal parser (frontmatter is delimited by `---` lines)

Check if any installed dependency already provides YAML/frontmatter parsing:
```bash
ls node_modules/yaml node_modules/js-yaml node_modules/gray-matter 2>/dev/null
```

If none available, install a minimal one (e.g., `yaml`) or write a small parser. Prefer using an existing transitive dependency if available.

### 2. Define the strategy interface

Create `src/strategies/DeliveryStrategy.js`:

```js
/**
 * Abstract delivery strategy.
 * Concrete strategies must implement handle().
 */
export class DeliveryStrategy {
  /**
   * @param {object} quill - Resolved quill object
   * @param {string} validatedContent - Content that has passed validation
   * @returns {Promise<{ status: string, url?: string, errors?: Array }>}
   */
  async handle(quill, validatedContent) {
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
```

### 3. Implement PassThroughStrategy

Create `src/strategies/PassThroughStrategy.js`:

- Extends `DeliveryStrategy`.
- Constructor accepts a callback/handler function that receives structured content and returns `{ status, url?, errors? }`.
- `handle()` calls the injected handler with the quill and content.
- This allows consumers to plug in their own delivery logic.

### 4. Implement RenderAndHostStrategy

Create `src/strategies/RenderAndHostStrategy.js`:

- Extends `DeliveryStrategy`.
- Uses `@quillmark/wasm` to render the content into an artifact (e.g., PDF).
- Serves/stores the artifact and returns a download URL.
- Constructor accepts configuration for the hosting details (output directory or base URL).

Explore `@quillmark/wasm` to understand:
- How to render content given a quill reference
- What format the rendered output is in
- How to write it to disk or serve it

### 5. Create strategies barrel

Create `src/strategies/index.js`:

```js
export { DeliveryStrategy } from './DeliveryStrategy.js';
export { PassThroughStrategy } from './PassThroughStrategy.js';
export { RenderAndHostStrategy } from './RenderAndHostStrategy.js';
```

### 6. Implement createDocument

Create `src/primitives/createDocument.js`:

```js
/**
 * @param {Registry} registry
 * @param {DeliveryStrategy} strategy
 * @param {string} content - Full Quillmark document (YAML frontmatter + markdown body)
 * @returns {Promise<{ status: string, url?: string, errors?: Array }>}
 */
export async function createDocument(registry, strategy, content) {
  // 1. Parse YAML frontmatter from content
  // 2. Extract QUILL: field — if missing, return { status: 'error', errors: [{ message: 'QUILL field is required in frontmatter' }] }
  // 3. Resolve quill from registry using the QUILL value
  // 4. Validate content against the quill (using @quillmark/wasm)
  // 5. If validation fails, return { status: 'error', errors: [...] }
  // 6. Delegate to strategy.handle(quill, validatedContent)
  // 7. Return the strategy's result
}
```

Requirements:
- Parse frontmatter and extract `QUILL:` field.
- Return structured error (not throw) when `QUILL:` is missing — this enables agent self-repair.
- Validation errors also return structured (not thrown).
- Delegate to strategy after validation passes.
- The function is `async`.

### 7. Update primitives barrel

Update `src/primitives/index.js`:

```js
export { listQuills } from './listQuills.js';
export { getSpecs } from './getSpecs.js';
export { createDocument } from './createDocument.js';
```

### 8. Write unit tests

**`test/strategies/PassThroughStrategy.test.js`**:
1. Calls the injected handler with quill and content.
2. Returns the handler's result.
3. Propagates handler errors.

**`test/strategies/RenderAndHostStrategy.test.js`**:
1. Renders content via wasm and returns a URL.
2. Handles render errors gracefully.

**`test/primitives/createDocument.test.js`**:
1. **Valid content** — frontmatter has `QUILL:`, content is valid; returns strategy result.
2. **Missing QUILL field** — returns `{ status: 'error', errors: [...] }` with a message about QUILL being required.
3. **Invalid quill ref** — quill not found in registry; returns structured error.
4. **Validation failure** — content doesn't match quill schema; returns errors array.
5. **Strategy delegation** — assert that `strategy.handle()` is called with the resolved quill and validated content.

Mock the registry, strategy, and wasm — no real quill files needed.

## Verification

```bash
# All tests pass (Phases 1-4)
npm test

# All functions importable
node -e "
  import('./src/primitives/index.js').then(m => {
    console.log('listQuills:', typeof m.listQuills);
    console.log('getSpecs:', typeof m.getSpecs);
    console.log('createDocument:', typeof m.createDocument);
  });
"

# Strategies importable
node -e "
  import('./src/strategies/index.js').then(m => {
    console.log('DeliveryStrategy:', typeof m.DeliveryStrategy);
    console.log('PassThroughStrategy:', typeof m.PassThroughStrategy);
    console.log('RenderAndHostStrategy:', typeof m.RenderAndHostStrategy);
  });
"
```

## Files Created / Modified

| File | Action |
|---|---|
| `src/strategies/DeliveryStrategy.js` | created |
| `src/strategies/PassThroughStrategy.js` | created |
| `src/strategies/RenderAndHostStrategy.js` | created |
| `src/strategies/index.js` | created |
| `src/primitives/createDocument.js` | created |
| `src/primitives/index.js` | modified (add createDocument export) |
| `test/strategies/PassThroughStrategy.test.js` | created |
| `test/strategies/RenderAndHostStrategy.test.js` | created |
| `test/primitives/createDocument.test.js` | created |

## What NOT to Do

- Do not implement a real file-hosting server in RenderAndHostStrategy — write to a local directory and return a file path or mock URL. Real hosting is a deployment concern.
- Do not add strategy auto-detection or a strategy registry — strategy is explicitly injected.
- Do not throw on missing `QUILL:` — return a structured error instead.

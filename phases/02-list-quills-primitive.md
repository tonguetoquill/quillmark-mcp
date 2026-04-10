# Phase 2: listQuills Primitive

## Goal

Implement the `listQuills(registry)` primitive — a pure function that returns quill metadata from a registry. Include unit tests.

## Context from PROGRAM.md

- `listQuills(registry)` returns a quill metadata array (name + description per quill).
- Never throws. Returns an empty list if no quills are available.
- Primitives are pure functions taking dependencies as arguments — no internal state.
- The registry comes from `@quillmark/registry` and uses `FileSystemSource` to load quills.

## Prerequisites

Phase 1 complete: project scaffolded, dependencies installed, `npm test` passes the smoke test.

## Tasks

### 1. Explore the @quillmark/registry API

Before writing code, inspect the installed `@quillmark/registry` package to understand:
- How to create/instantiate a registry
- How to list available quills (method names, return shapes)
- What metadata is available on each quill (at minimum: name, description)

```bash
# Inspect the package exports and types
node -e "import('@quillmark/registry').then(m => console.log(Object.keys(m)))"
```

Read relevant source/type files under `node_modules/@quillmark/registry` to understand the API surface.

### 2. Implement listQuills

Create `src/primitives/listQuills.js`:

```js
/**
 * @param {Registry} registry
 * @returns {Array<{ name: string, description: string }>}
 */
export function listQuills(registry) {
  // ...
}
```

Requirements:
- Accept a registry instance as the sole argument.
- Return an array of objects with at least `name` and `description` fields.
- **Never throw.** Wrap the registry call in a try/catch; return `[]` on any error.
- Keep it minimal — no caching, no filtering, no transformation beyond what's described.

### 3. Write unit tests

Create `test/primitives/listQuills.test.js`:

Test cases:
1. **Returns quill metadata from a populated registry** — create a mock/stub registry that returns known quills; assert the output shape and values.
2. **Returns empty array when registry has no quills** — mock registry returns empty; assert `[]`.
3. **Returns empty array when registry throws** — mock registry that throws; assert `[]` (no exception propagates).
4. **Output shape** — each item has `name` (string) and `description` (string).

Use `node:test` (`describe`/`it`) and `node:assert/strict`. Mock the registry — do not require real quill files for unit tests.

### 4. Export from primitives barrel

Create `src/primitives/index.js`:

```js
export { listQuills } from './listQuills.js';
```

## Verification

```bash
# Unit tests pass
npm test

# Function is importable
node -e "import('./src/primitives/index.js').then(m => console.log(typeof m.listQuills))"
# Expected output: "function"
```

## Files Created / Modified

| File | Action |
|---|---|
| `src/primitives/listQuills.js` | created |
| `src/primitives/index.js` | created |
| `test/primitives/listQuills.test.js` | created |

## What NOT to Do

- Do not instantiate a real registry or load quill files — that's the MCP server's job.
- Do not add caching or pagination logic.
- Do not modify package.json exports yet (Phase 6).

# Phase 6: Package Exports & Integration Tests

## Goal

Wire up the package entry point (`src/index.js`), configure `package.json` exports for both consumption modes (plug-and-play MCP server and composable primitives), and add integration tests that exercise the full stack with real (or realistic fixture) quills.

## Context from PROGRAM.md

### Two Consumption Modes
1. **Plug-and-play MCP**: `QuillmarkMCP` class — one-liner to start a server.
2. **Composable primitives**: Individual functions (`listQuills`, `getSpecs`, `createDocument`) for custom orchestration. Dependencies passed as arguments.

### Package Architecture
- The entrypoint structure decision (single root export vs. subpath exports) was bookmarked for implementation time.
- MCP class is built from primitives; primitive consumers own their own lifecycle.

### Initialization
- `@quillmark/wasm` and quills initialize eagerly at startup.
- Use `FileSystemSource` from `@quillmark/registry`.

## Prerequisites

Phases 1-5 complete: all primitives, strategies, and QuillmarkMCP class implemented and tested.

## Tasks

### 1. Wire up src/index.js

Update `src/index.js` to re-export everything consumers need:

```js
// Plug-and-play MCP server
export { QuillmarkMCP } from './mcp/index.js';

// Composable primitives
export { listQuills, getSpecs, createDocument } from './primitives/index.js';

// Strategies (consumers need these to construct and inject)
export { DeliveryStrategy, PassThroughStrategy, RenderAndHostStrategy } from './strategies/index.js';
```

### 2. Configure package.json exports

Update `package.json` with the `"exports"` field:

```json
{
  "exports": {
    ".": "./src/index.js",
    "./primitives": "./src/primitives/index.js",
    "./strategies": "./src/strategies/index.js",
    "./mcp": "./src/mcp/index.js"
  },
  "main": "./src/index.js"
}
```

This gives consumers flexibility:
- `import { QuillmarkMCP } from 'quillmark-mcp'` — full package
- `import { listQuills } from 'quillmark-mcp/primitives'` — just primitives
- `import { PassThroughStrategy } from 'quillmark-mcp/strategies'` — just strategies

### 3. Create a test quill fixture

Create `test/fixtures/quills/` with a minimal test quill that exercises the full pipeline. Inspect `@quillmark/registry`'s `FileSystemSource` to understand the expected directory structure and quill file format.

The fixture quill should:
- Have a name and description (for `listQuills`)
- Have a JSON Schema (for `getSpecs`)
- Have authoring instructions (for `getSpecs`)
- Accept minimal content for rendering (for `createDocument`)

### 4. Write integration tests

Create `test/integration.test.js`:

**Test: Cold-start discovery journey**
Exercises the full agent journey from PROGRAM.md:
1. Create a real registry from `FileSystemSource` pointing at the fixture quills directory.
2. Call `listQuills(registry)` — assert it returns the fixture quill.
3. Call `getSpecs(registry, fixtureRef)` — assert it returns TOON-encoded schema and instructions.
4. Call `createDocument(registry, strategy, validContent)` with a `PassThroughStrategy` — assert it returns `{ status: 'success', ... }`.

**Test: Error paths**
1. `getSpecs` with invalid ref — assert it throws.
2. `createDocument` with missing `QUILL:` — assert it returns structured error.
3. `createDocument` with invalid content — assert it returns validation errors.

**Test: Package exports are accessible**
```js
// Verify all exports resolve
import { QuillmarkMCP, listQuills, getSpecs, createDocument, PassThroughStrategy, RenderAndHostStrategy } from '../src/index.js';
// Assert all are defined and have expected types
```

### 5. Update start script

Ensure the `"start"` script in `package.json` works. Update `src/index.js` or create a small `src/cli.js` if needed — but only if the start script needs a runnable entry point distinct from the library export.

If a CLI entry point is needed:
```js
// src/cli.js
import { QuillmarkMCP } from './mcp/index.js';
import { RenderAndHostStrategy } from './strategies/index.js';

const server = new QuillmarkMCP({
  quillsDir: process.env.QUILLS_DIR || './quills',
  strategy: new RenderAndHostStrategy({ /* defaults */ }),
});

await server.start();
```

Update `package.json`: `"start": "node src/cli.js"`

### 6. Final test sweep

Run the full test suite and fix any issues:

```bash
npm test
```

Ensure all tests from all phases pass together.

## Verification

```bash
# Full test suite passes
npm test

# Root export works
node -e "
  import('quillmark-mcp').then(m => {
    const exports = Object.keys(m);
    console.log('Root exports:', exports);
    // Should include: QuillmarkMCP, listQuills, getSpecs, createDocument,
    //                 DeliveryStrategy, PassThroughStrategy, RenderAndHostStrategy
  });
" 2>/dev/null || node -e "
  import('./src/index.js').then(m => {
    const exports = Object.keys(m);
    console.log('Root exports:', exports);
  });
"

# Subpath exports work
node -e "import('./src/primitives/index.js').then(m => console.log('Primitives:', Object.keys(m)))"
node -e "import('./src/strategies/index.js').then(m => console.log('Strategies:', Object.keys(m)))"
node -e "import('./src/mcp/index.js').then(m => console.log('MCP:', Object.keys(m)))"

# Integration tests pass specifically
node --test test/integration.test.js
```

## Files Created / Modified

| File | Action |
|---|---|
| `src/index.js` | modified (add all exports) |
| `src/cli.js` | created (if needed for start script) |
| `package.json` | modified (add exports field, update start script) |
| `test/fixtures/quills/` | created (test quill fixture) |
| `test/integration.test.js` | created |

## What NOT to Do

- Do not add TypeScript declaration files or build steps — this is pure ESM JavaScript.
- Do not add a bin field or CLI argument parsing with yargs/commander — keep the start script simple.
- Do not add bundling — consumers import directly from source.
- Do not over-engineer the fixture quill — minimal is better.

# Phase 1: Project Scaffolding & Configuration

## Goal

Initialize the Node.js project, install all dependencies, establish the directory structure, and configure the build/test tooling. No application code — just the skeleton that all later phases build on.

## Context from PROGRAM.md

- **Runtime**: Node 25
- **MCP framework**: fastmcp@3.35
- **Test runner**: built-in `node:test`
- **Core libraries**: @quillmark/wasm@0.51.1, @quillmark/registry, @toon-format/toon
- **Philosophy**: composable primitives with an MCP layer on top; less is more

## Tasks

### 1. Initialize package.json

```bash
npm init -y
```

Set in `package.json`:
- `"name": "quillmark-mcp"`
- `"type": "module"` (ESM throughout)
- `"engines": { "node": ">=25.0.0" }`
- `"scripts"`:
  - `"test": "node --test"`
  - `"start": "node src/index.js"`

### 2. Install dependencies

Production:
```bash
npm install fastmcp@3.35 @quillmark/wasm@0.51.1 @quillmark/registry @toon-format/toon
```

Dev (none required yet — `node:test` is built-in).

### 3. Create directory structure

```
src/
  primitives/       # listQuills, getSpecs, createDocument
  strategies/       # Delivery strategy implementations
  mcp/              # QuillmarkMCP class and tool definitions
  index.js          # Package entry point (empty placeholder)
test/
  primitives/
  strategies/
  mcp/
```

Create each directory. Place an empty `src/index.js` as a placeholder.

### 4. Add a smoke-test file

Create `test/smoke.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke', () => {
  it('node:test runner works', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

## Verification

Run all checks below — all must pass:

```bash
# Dependencies installed
ls node_modules/@quillmark/wasm node_modules/@quillmark/registry node_modules/@toon-format/toon node_modules/fastmcp

# Directory structure exists
ls src/primitives src/strategies src/mcp test/primitives test/strategies test/mcp

# Test runner works
npm test

# Entry point exists
node -e "import('./src/index.js')"
```

## Files Created / Modified

| File | Action |
|---|---|
| `package.json` | created |
| `package-lock.json` | created (by npm) |
| `src/index.js` | created (empty placeholder) |
| `src/primitives/` | directory created |
| `src/strategies/` | directory created |
| `src/mcp/` | directory created |
| `test/smoke.test.js` | created |
| `test/primitives/` | directory created |
| `test/strategies/` | directory created |
| `test/mcp/` | directory created |

## What NOT to Do

- Do not write any application logic yet.
- Do not configure TypeScript, ESLint, or bundlers — keep the surface minimal.
- Do not create README or documentation files.

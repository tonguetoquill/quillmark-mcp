## High-Level Implementation Plan: `npx quillmark-mcp` Entrypoint

### Background

`quillmark-mcp` is currently a library-only package. Users must instantiate `QuillmarkMCP` programmatically, which creates friction for basic use cases. This feature adds a zero-dependency CLI entrypoint so the server can be started directly via `npx quillmark-mcp`.

---

### Scope

- New file: `src/bin.js` — the CLI entrypoint
- Modified file: `package.json` — add `bin` field, include `quills/` in published files
- New directory: `quills/` — bundled example Quill (provided separately before implementation)
- No changes to existing library code (`src/mcp/`, `src/primitives/`, `src/strategies/`)

---

### Step 1 — Add the example Quill

Place the provided example Quill into the package under `quills/`, following the existing directory convention:

```
quills/
└── <quill_name>/
    └── <version>/
        ├── Quill.yaml
        └── plate.typ   (or equivalent template file)
```

This directory becomes the `--quills-dir` default and ships with the package as a working out-of-the-box example.

---

### Step 2 — Create `src/bin.js`

A short, self-contained script (~30 lines). Responsibilities:

1. **Parse CLI flags** using `util.parseArgs` (Node.js built-in, no added dependencies). Supported flags:

   | Flag | Type | Default | Description |
   |---|---|---|---|
   | `--quills-dir` | string | `./quills` relative to `cwd` | Path to Quill definitions directory |
   | `--output-dir` | string | `.artifacts` | Where rendered artifacts are written |
   | `--base-url` | string | `file://` | Base URL prepended to artifact paths in tool responses |

2. **Resolve `quillsDir`** — treat as relative to `process.cwd()` if not absolute.

3. **Instantiate and start** the server:
   ```js
   const strategy = new RenderAndHostStrategy({ outputDir, baseUrl });
   const mcp = new QuillmarkMCP({ quillsDir, strategy });
   await mcp.start(); // stdio transport, FastMCP default
   ```

4. **Error on bad config** — if `quillsDir` does not exist, print a clear message to stderr and exit with a non-zero code. No other validation needed at this layer; the registry handles the rest.

The file must have a `#!/usr/bin/env node` shebang and be marked executable.

---

### Step 3 — Update `package.json`

Two changes:

1. Add a `bin` field pointing to the entrypoint:
   ```json
   "bin": {
     "quillmark-mcp": "src/bin.js"
   }
   ```

2. Ensure `quills/` is included in the published package. If a `files` field exists or is added, include `"quills/"` explicitly.

---

### Out of scope (deferred)

- Environment variable support (`QUILLMARK_QUILLS_DIR`, etc.)
- `--init` / scaffold behavior
- Additional transport options (HTTP, SSE)
- Exposing `format` or other `RenderAndHostStrategy` options
- A `--help` flag (nice-to-have, not required)
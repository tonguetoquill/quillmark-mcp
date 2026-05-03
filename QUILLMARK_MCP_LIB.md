# @quillmark/mcp — Implementation Handover

The Quillmark MCP integration library. Owns the parse → resolve → validate → MCP-envelope pipeline. Stops at delivery — the consumer decides whether bytes are rendered now and persisted, deferred to a web app, or anything else. Engine and quiver bootstrap stay with the consumer; the ecosystem APIs (`new Quillmark()`, `Quiver.fromDir`) are already terse and we don't wrap them.

## Purpose

A consumer building a Quillmark MCP server brings three things and hands them to `registerQuillmarkTools` along with their `McpServer`:

1. A `Quiver` (loaded with `Quiver.fromDir` / `fromPackage` / `fromBuilt`).
2. A `Quillmark` engine (`new Quillmark()`).
3. A `Deliverer` function describing what to do with a resolved-and-validated document.

Three Quillmark tools are then registered with proper MCP envelope handling. Everything else — transport, auth, static hosting, CLI, the deliverer's actual logic — stays out.

The package is Quillmark-specific by design. Anyone wanting a non-Quillmark MCP server uses `@modelcontextprotocol/sdk` directly. The library is not an aspirational generic toolkit.

## Audience

Two profiles, one API:

1. **Embedded.** A service builds its own `McpServer`, calls `registerQuillmarkTools`, and connects the SDK's transports under its own framework, auth, and lifecycle.
2. **Stdio CLI / Docker.** `quillmark-mcp-turnkey` is the canonical example: builds the `McpServer`, calls `registerQuillmarkTools`, connects an SDK `StdioServerTransport` (or HTTP transport).

The library doesn't distinguish between them.

## Stack

- Node.js ≥ 24, ESM, top-level `await`.
- TypeScript source compiled via `tsc`. `package.json` `prepare` script builds on install (so `npm link` against a fresh checkout works without manual build).
- Runtime deps (bundled): `@quillmark/wasm`, `@quillmark/quiver`, `@toon-format/toon`. Anyone reaching for `@quillmark/mcp` wanted Quillmark.
- Peer deps: `@modelcontextprotocol/sdk`, `zod`. Consumer supplies them; the library uses their copies (no cross-realm `instanceof` issues).

## Invariants

These and *Non-goals* are firm. Module layout, internal helper names, and exact wire formats for non-spec details are implementer discretion — update this doc if a cleaner pattern surfaces.

- **Library owns the parse → resolve → validate pipeline plus MCP wiring.** Consumer never calls `Document.fromMarkdown`, never `quill.form`, never `quill.render` (deliverer uses the curated `render` closure instead).
- **Library does not own engine or quiver bootstrap.** `init()`, `new Quillmark()`, `Quiver.fromX`, `quiver.warm()` are the consumer's. Two reasons: (a) the ecosystem deliberately keeps engine and quiver as separate concerns (one engine can serve many quivers), and (b) bundling them buys one line at the cost of an extra abstraction the consumer has to learn.
- **Library owns no transport or deployment plumbing.** No `start()`, no stdio bootstrap, no `requestHandler()`, no middleware, no default deliverer, no auth, no static hosting, no CLI.
- **Validation runs before delivery.** `createDocument` calls `quill.form(doc)` after resolution; fatal diagnostics short-circuit to `{ status: 'error', errors }`. The deliverer is invoked only on validation success and trusts the doc is schema-valid.
- **Deliverer signature is curated.** No `Quill`, no `RenderResult`. The deliverer receives `{ doc, render, canonicalRef, metadata }` — render is a pre-bound closure returning artifacts, canonicalRef is the resolved version (e.g. `"memo@1.2.3"`), metadata is the quill identity/schema snapshot.
- **Render warnings are library-managed.** The render closure captures `RenderResult.warnings` internally; the library folds them into the success envelope's `warnings` field. The deliverer doesn't see them and can't drop them.
- **Stay off stdout.** Internal logging goes to stderr (stdout is reserved for stdio JSON-RPC framing — a single stray byte disconnects the client).
- **Tool exceptions become tool results.** Inside `registerQuillmarkTools`'s callbacks, every throw is caught and converted to an `{ isError: true }` envelope. The SDK's transport-level error path is never reached for tool failures.
- **Tool registration is one shot.** Calling `registerQuillmarkTools` twice on the same `McpServer` lets the SDK's duplicate-name error fire; we don't add a layer.

## Public API

Four runtime exports. Plus type exports. No sub-namespaces.

```ts
import {
  listQuills,
  getSpecs,
  createDocument,
  registerQuillmarkTools,
  type Deliverer,
  type DeliveryResult,
  type QuillMetadata,
  // wasm types re-exported for the deliverer signature:
  type Document,
  type Artifact,
  type RenderOptions,
  type Diagnostic,
  type OutputFormat,
} from '@quillmark/mcp';
```

## Setup (consumer-side)

Canonical five-line bootstrap. The library imports nothing into this flow — the consumer wires the ecosystem packages directly:

```ts
import { Quillmark, init } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver';
import { registerQuillmarkTools, type Deliverer } from '@quillmark/mcp';

init();                                              // optional panic-hook setup
const engine = new Quillmark();
const quiver = await Quiver.fromDir('./quiver');     // or fromPackage / fromBuilt
await quiver.warm();                                 // recommended; prefetches trees

const deliver: Deliverer = async ({ doc, render }) => { /* ... */ };

registerQuillmarkTools(mcpServer, { quiver, engine, deliver });
```

`init()` is idempotent panic-hook setup; calling it more than once is harmless. `quiver.warm()` is engine-independent and prefetches every quill tree so first-request latency stays low.

### `listQuills(quiver, engine): Promise<Array<{ name: string; description: string }>>`

Iterates `quiver.quillNames()`, resolves each via `quiver.getQuill(name, { engine })` to access metadata, returns `name` + `description`. Per-quill metadata failures isolated (logged to stderr, skipped). Returns `[]` for empty/unreadable catalogs.

### `getSpecs(quiver, engine, ref): Promise<{ schema: string; instructions: string }>`

Resolves `ref` (`name`, `name@x`, `name@x.y`, `name@x.y.z`) via `quiver.getQuill(ref, { engine })`. Returns:

- `schema`: TOON-encoded `quill.metadata.schema` (uses `@toon-format/toon`).
- `instructions`: `quill.metadata.instructions ?? ''`.

Throws on missing/invalid `ref` or resolution failure (the MCP-layer wrapper converts the throw into an `isError: true` envelope).

### `createDocument(quiver, engine, deliver, content): Promise<DeliveryResult>`

The full Quillmark pipeline:

```
Document.fromMarkdown(content)               // throws → { status: 'error', errors }
  → quiver.getQuill(doc.quillRef, { engine })  // throws → { status: 'error', errors }
  → quill.form(doc)                          // fatal diagnostics → { status: 'error', errors }
  → deliver({ doc, render, canonicalRef, metadata })
```

Render warnings captured by the bound `render` closure and folded into `result.warnings` on success.

```ts
type Deliverer = (input: {
  doc: Document;
  render: (opts?: RenderOptions) => Artifact[];
  canonicalRef: string;               // resolved version, e.g. "memo@1.2.3"
  metadata: QuillMetadata;
}) => Promise<DeliveryResult>;

type DeliveryResult =
  | { status: 'success'; warnings?: Diagnostic[]; [key: string]: unknown }
  | { status: 'error'; errors: Array<{ message: string; path?: string; severity?: string }> };
```

Deliverer throws propagate from `createDocument`. The MCP-layer try/catch in `registerQuillmarkTools` is the only safety net, and only on the MCP path.

#### Eager-render deliverer (turnkey-style)

```ts
const deliver: Deliverer = async ({ doc, render }) => {
  const [artifact] = render({ format: 'pdf' });
  const path = join(outDir, `${randomUUID()}.pdf`);
  await fs.writeFile(path, artifact.bytes);
  return { status: 'success', url: `${baseUrl}/${basename(path)}` };
};
```

#### Deferred web-app deliverer

```ts
const deliver: Deliverer = async ({ doc, canonicalRef }) => {
  const id = randomUUID();
  await db.put(id, { content: doc.toMarkdown(), quillRef: canonicalRef });
  return { status: 'success', url: `https://app.example.com/docs/${id}` };
};
```

### `registerQuillmarkTools(mcpServer, { quiver, engine, deliver }): void`

Registers three tools on the consumer's `McpServer` via `mcpServer.registerTool(...)`. Tool callbacks own envelope wrapping and exception → `isError` mapping.

| Tool name         | Input schema              | Calls                                              |
|-------------------|---------------------------|----------------------------------------------------|
| `list_quills`     | `z.object({})`            | `listQuills(quiver, engine)`                       |
| `get_specs`       | `z.object({ ref })`       | `getSpecs(quiver, engine, ref)`                    |
| `create_document` | `z.object({ content })`   | `createDocument(quiver, engine, deliver, content)` |

For `create_document`, the callback additionally maps `result.status === 'error'` to `isError: true` on the envelope (so clients distinguishing errored tool calls render correctly), without treating it as a thrown error.

## Tool callback contract

Every callback follows this shape:

```ts
async (args) => {
  try {
    const result = await primitive(...);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: isPojo(result) ? result : undefined,
      isError: shouldFlagAsError(result),
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: getErrorMessage(err) }],
      isError: true,
    };
  }
};
```

- `isPojo`: only plain object literals (`Object.getPrototypeOf(v) === Object.prototype`) get `structuredContent`. Arrays, Maps, class instances, primitives, and `null` set it to `undefined`.
- `getErrorMessage`: `err?.message ?? String(err)`. Internal helper, not exported.
- `shouldFlagAsError`: `false` for `list_quills` / `get_specs`; `result.status === 'error'` for `create_document`.

Tool descriptions and parameter docs are baked into each registration call. The library owns tool-level guidance ("how to use the tool"); per-quill authoring guidance lives in `quill.metadata` and surfaces through `get_specs`.

## QuillMetadata shape

The library defines its own `QuillMetadata` because `@quillmark/wasm` types `metadata` as `any`. Mirror the documented shape:

```ts
interface QuillMetadata {
  schema: {
    name: string;
    main: { fields: Record<string, unknown>; description?: string };
    card_types?: Record<string, { fields: Record<string, unknown> }>;
    example?: string;
  };
  backend: string;
  version: string;
  author?: string;
  description: string;          // quill-level
  supportedFormats: string[];   // lowercase
  instructions?: string;        // pulled from quill: section
  [key: string]: unknown;
}
```

## Non-goals

Explicit. None of these belong in the library, even under a sub-namespace:

- **Stdio start/stop.** Two SDK lines; consumer owns it.
- **HTTP request handler / per-request rebuild.** SDK ergonomics, not our problem.
- **Middleware** (`compose`, `routeMatch`, `bearerAuth`, `staticRoute`, `notFoundJson`). Turnkey or consumer code.
- **Default deliverer / `RenderAndHostStrategy`.** Deployment opinions live in turnkey.
- **Strategy base class** (`DeliveryStrategy`). `Deliverer` is a function type.
- **Composition helpers** (`withRetry`, `withTimeout`, `pipe`). Generic JS; five lines each.
- **`renderAndPersist` or other Quillmark-flavored composition helpers.** Borderline; defer until two callers want it.
- **Generic `addTool` API.** Consumers use `mcpServer.registerTool` directly for their own tools.
- **`createMcpServer` or `createQuillmarkServer` factory.** Aspirational generic toolkit / transport ownership; cut.
- **Engine construction, `init()` ordering, quiver source dispatch, warming.** Consumer's job. The wrapper we briefly considered (`loadQuiver`) saved one line, hid one decision (`fromX` selection), and added an abstraction the ecosystem deliberately doesn't have. Not worth it.
- **`prepare` lifecycle.** Consumer calls `quiver.warm()` if it wants eager init.
- **Exported logger or `getErrorMessage`.** Internal use only.
- **CLI scaffolding, Docker, install snippets, per-client config.** That's `quillmark-mcp-turnkey`.
- **MCP resources and prompts.** v1 is tools-only.
- **Non-text tool outputs** (images, audio, resource references). Every return renders into `content[0].text`.
- **Sessioned HTTP, OAuth 2.1 discovery, OAuth-probe 404.** Consumer / turnkey concerns.
- **Tool toggles / subset selection.** Consumer registers a subset by hand from the primitives.
- **Validate-only tool / primitive.** Validation is implicit in `createDocument`; LLM iteration loop is `try → fix → try` against the error envelope.
- **`Quill` or `RenderResult` in the deliverer signature.** Curated input only.
- **`format` parameter on the MCP tool.** Deliverer's choice; not exposed to the LLM.
- **Sub-namespaces.** Top level fits.

## Module layout

Sketch — consolidate or split as natural.

```
@quillmark/mcp/
  src/
    index.ts                        # runtime + type re-exports
    primitives/
      listQuills.ts
      getSpecs.ts
      createDocument.ts             # parse → resolve → validate → deliver
    registerQuillmarkTools.ts       # SDK registerTool calls + envelope wrapping
    internal/
      pojo.ts                       # isPojo predicate
      errorMessage.ts               # getErrorMessage extractor
      diagnostics.ts                # fatal-vs-warning classification for form() output
      types.ts                      # public types (Deliverer, DeliveryResult, QuillMetadata)
  test/
    listQuills.test.ts
    getSpecs.test.ts
    createDocument.test.ts
    registerQuillmarkTools.test.ts
  package.json
  tsconfig.json
```

## Testing

Vitest. Coverage targets:

- **`listQuills`**: fixture quiver with two quills → both returned. Quill with broken metadata → skipped, others returned, stderr noted.

- **`getSpecs`**: valid ref → schema/instructions; selector ref (`name`, `name@x`) → resolves to highest match; missing ref → throws.

- **`createDocument`**: malformed frontmatter → error result; unknown quill → error result; schema violation (missing required field) → error result with diagnostic; valid content + eager deliverer → deliverer's result with render warnings folded into `warnings`; valid content + deferred deliverer (no render call) → deliverer's result, no warnings; deliverer throws → propagates from `createDocument`.

- **`registerQuillmarkTools`**: integration test using the SDK's in-memory transport pair. Invoke each tool through JSON-RPC; assert envelope:
  - `content[0].text` is the JSON-stringified primitive result.
  - `structuredContent` matches the result for POJOs, omitted otherwise.
  - `isError: true` for: thrown primitive errors (all three tools), `create_document` returning `{ status: 'error' }`. `false` otherwise.

No tests for stdio or HTTP transports — the library doesn't own them.

## Versioning

Semver. `0.x` is pre-release; breaking changes land in `0.minor` bumps. After `1.0`, tracks the MCP SDK's major version: SDK major bump ⇒ `@quillmark/mcp` major bump.

## Migration from current code

The existing `src/` in `quillmark-mcp-turnkey` mixes library and turnkey concerns. Suggested split:

| Current location                            | New home                                                                  |
|---------------------------------------------|---------------------------------------------------------------------------|
| `src/primitives/listQuills.js`              | `@quillmark/mcp/src/primitives/listQuills.ts`                              |
| `src/primitives/getSpecs.js`                | `@quillmark/mcp/src/primitives/getSpecs.ts`                                |
| `src/primitives/createDocument.js`          | `@quillmark/mcp/src/primitives/createDocument.ts` (extended with `quill.form` validation step) |
| `src/mcp/createDefaultMCP.js` engine + quiver bootstrap | Stays in `quillmark-mcp-turnkey` (consumer-side setup; library does not own it) |
| `src/mcp/QuillmarkMCP.js` (tool wiring)     | `@quillmark/mcp/src/registerQuillmarkTools.ts`                             |
| `src/mcp/McpSdkServerAdapter.js`            | Delete; collapse SDK calls into the registration helper                    |
| `src/mcp/createDefaultMCP.js` (the rest)    | Replace with inline turnkey wiring: `init()`, `new Quillmark()`, `Quiver.fromDir`, `quiver.warm()`, then `registerQuillmarkTools` |
| `src/strategies/RenderAndHostStrategy.js`   | `quillmark-mcp-turnkey/src/deliverer.{ts,js}` (rewritten against the new `Deliverer` signature: `(input) => Promise<DeliveryResult>`) |
| `src/strategies/DeliveryStrategy.js`        | Delete; type lives in `@quillmark/mcp`                                     |
| `src/mcp/httpServer.js`                     | `quillmark-mcp-turnkey` (already turnkey-flavored)                         |
| `src/bin.js`                                | `quillmark-mcp-turnkey` (CLI)                                              |
| `src/errors.js`, `src/logger.js`            | Inline what survives in `internal/`; delete the rest                       |

After the split, `quillmark-mcp-turnkey` depends on `@quillmark/mcp` and contributes its own deliverer (filesystem + `baseUrl` URL shape), HTTP middleware, CLI, Docker artifacts, and any remaining deployment knobs.

## Acceptance

The library is done when:

1. Four runtime exports + the documented type exports compile and resolve from a fresh `npm install`.
2. The vitest suite passes against a fixture quiver covering: success path, parse error, resolve error, schema violation, deliverer throw, deferred deliverer (no render call), eager deliverer with captured warnings.
3. `quillmark-mcp-turnkey` migrates to depend on `@quillmark/mcp` and its existing integration tests pass — proving the API covers stdio + HTTP consumer paths without the library owning either transport.
4. No exported symbol matches a *Non-goal* above.

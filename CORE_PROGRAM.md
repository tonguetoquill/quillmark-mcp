# mcp-core

A small, opinionated toolkit for building MCP servers in Node.js.

Pure utilities. No domain logic. No framework. No CLI. Consumers stay in control.

## Why this exists

Every MCP server author rediscovers the same handful of non-obvious problems:
stateless-HTTP transport semantics, stdout contamination breaking stdio JSON-RPC,
result-wrapping quirks of `@modelcontextprotocol/sdk`, path-traversal hardening
for artifact serving, and embedding an MCP endpoint into a host HTTP framework
without reaching past the public API.

`mcp-core` solves each of those once, in one place, with a flat API. It does
not invent abstractions on top of the SDK; it fills the gaps the SDK leaves.

## Consumers

Two profiles drive the API shape:

1. **Plug-and-play servers.** A standalone Node binary or Docker image with
   stdio + stateless HTTP, artifact serving, and a default delivery. The
   binary's argv parsing, env precedence, install snippets, and Docker
   conventions live in the consuming application — *not* in this library.
2. **Bespoke integrations.** A third-party service that embeds the MCP
   endpoint inside its own HTTP framework (Express, Fastify, Hono, a
   serverless handler) and ships a custom delivery — direct PDF render
   over HTTP, an app-platform API call returning a link, etc.

Both consumers get the same primitives. Profile #2 must be able to **mount**
the MCP endpoint into an existing HTTP server without `mcp-core` owning the
listener.

## Non-goals

- No tool registry, plugin system, or DI container.
- No "BaseServer" orchestrator. Consumers register tools on the adapter directly.
- No domain-specific delivery strategies. Consumers own their tool logic.
- No schema encoding helpers (TOON, JSON-Schema-to-Markdown, etc.).
- **No CLI scaffolding.** Argv parsing, env precedence, bind-string parsing,
  install snippets, Docker templates, and per-client config formats are
  application concerns, not library concerns. They depend on opinions about
  argv conventions, env-var prefixes, client targets, and deployment shape.
  A library that ships them either imposes those opinions or makes them
  configurable enough to become its own framework. We do neither.
- No support for transports the SDK doesn't ship.

## Stack

- Node.js ≥ 24
- `@modelcontextprotocol/sdk` (peer dep)
- `zod` (peer dep — used for tool input schemas)
- `loglevel`
- Zero runtime deps beyond the above.

## Public API

Four entry points. Each does one thing.

### `createMcpServer(options) → McpServer`

The transport adapter. Wraps the SDK's `McpServer` with stateless-HTTP and
stdio support, an embedding seam, and the SDK quirks pre-solved.

```js
import { createMcpServer } from 'mcp-core';

const server = createMcpServer({ name: 'myapp', version: '1.0.0' });

server.addTool({
  name: 'echo',
  description: 'Echo input.',
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});
```

#### Standalone — own the HTTP listener

```js
await server.start({ transport: 'stdio' });
// or
await server.start({
  transport: 'http',
  host: 'localhost',
  port: 8080,
  endpoint: '/mcp',
  authToken: process.env.AUTH_TOKEN,             // optional Bearer
  staticRoutes: [{ urlPath: '/files', dir: '/data' }], // optional
});

await server.stop();
```

#### Embedded — mount into a host framework

```js
import express from 'express';
import { createMcpServer } from 'mcp-core';

const app = express();
const server = createMcpServer({ name: 'myapp', version: '1.0.0' });
server.addTool(/* ... */);

app.use('/mcp', server.requestHandler({ authToken: process.env.AUTH_TOKEN }));

app.listen(8080);
```

`requestHandler({ authToken? })` returns a Node `(req, res, next?) => void`
handler that works in raw `http`, Express, Fastify (`fastify.use`), or any
serverless adapter that exposes a Node-shaped request/response. It does not
own a listener and does not call `start()`/`stop()`; the host framework
manages lifecycle.

The handler rebuilds the per-request `McpServer` the SDK requires for
stateless HTTP, applies optional Bearer auth, and wraps tool results
identically to standalone mode.

#### Owns

- Per-request `McpServer` rebuild for stateless HTTP (the SDK forbids reuse).
- Long-lived `McpServer` for stdio.
- Tool result wrapping: `stringifyToolResult` for `content[0].text`,
  `structuredContent` only when the return value is a plain record.
- `normalizeToolArgs`: never destructures `undefined`/`null`/primitives.
- Optional Bearer auth — uniformly applied in standalone and embedded modes.
- Optional static routes (standalone mode) with directory-traversal protection
  (rejects `..`, separators in filenames, and resolved-path escapes; sets
  `Content-Type` from a small MIME map; `Content-Disposition: attachment`).
- JSON 404 on unmatched HTTP routes when standalone (so OAuth-probing clients
  don't crash).
- Graceful `stop()` for both transports (standalone only — embedded consumers
  manage their own lifecycle).

### `serveFile(req, res, { dir, filename })` → void

The static-file helper as a standalone export. Same path-traversal guard,
MIME map, and `Content-Disposition` behavior as the integrated `staticRoutes`
option, but usable from any handler. Embedded consumers wire it into their
own router when they want artifact downloads; consumers whose delivery
returns a remote URL ignore it.

### `logger` and `createLogger(options)`

Stderr-only structured logger. Anything on stdout corrupts stdio JSON-RPC.

```js
import { logger } from 'mcp-core';
logger.info('started');
logger.error(new Error('boom'));
logger.debug({ reqId: 'abc' }, 'handling');
```

- Reads `LOG_LEVEL` env var; defaults to `info`.
- ISO timestamp + uppercase level prefix on every line.
- All output to `process.stderr`. Always.
- `createLogger({ level, name })` for callers who need a named sub-logger.

### `getErrorMessage(error) → string`

Coerces any thrown value (Error, plain object, primitive) to a readable
string. Used internally by the adapter and exported because every consumer
ends up needing it in tool `execute` handlers.

## Module layout

```
mcp-core/
  src/
    index.js                  # re-exports
    server/
      McpServer.js            # createMcpServer + adapter class
      requestHandler.js       # embedding seam (Node http handler)
      stringify.js            # result wrapping (stringifyToolResult, isPlainRecord)
      args.js                 # normalizeToolArgs
      static.js               # serveFile + path-traversal guard
    logger.js
    errors.js                 # getErrorMessage
  test/
    *.test.js                 # node --test
```

## Design decisions

**One adapter, no orchestrator.** Tool registration belongs on the adapter.
Consumers register tools directly. If they want a higher-level wrapper, they
write one.

**Tools live as closures.** No tool registry, no metadata indirection.
`server.addTool(tool)` pushes the tool onto an internal array; per-request
HTTP rebuilds re-register the same closures.

**Embedding is a first-class shape.** `requestHandler()` exists because
Consumer Profile #2's host server already owns the listener. Forcing them to
run a second listener and reverse-proxy, or to reach past the public API
into the SDK, would defeat the purpose of this library. Standalone and
embedded modes share every quirk-fix; only lifecycle ownership differs.

**Static routes are optional and standalone-only by default.** Embedded
consumers either don't need static serving (their delivery returns a remote
URL) or wire `serveFile` into their own router. The integrated `staticRoutes`
option is sugar for standalone mode, not a core capability.

**No "MCP" base class for tools.** Tool result wrapping is a single function
applied uniformly to every `execute` return value. There's nothing to
subclass.

**Fail fast on construction; never throw from tool handlers.** `addTool`
validates shape at registration time. At request time, exceptions inside
`execute` are caught and surfaced as MCP error results — the SDK contract
forbids transport-level throws inside tool dispatch.

**Stateless HTTP is the only HTTP mode.** Sessioned HTTP transport is more
complex, harder to scale, and rarely needed. We do not expose it. If a
consumer needs sessions, they instantiate the SDK directly.

**No telemetry, metrics, or tracing hooks.** Adding them speculatively
guarantees a wrong API. Consumers wrap `execute` themselves if they want
timing.

**Peer-deps for the SDK and zod.** Avoids version skew. Consumers pin the
versions they ship.

## Versioning & compatibility

- Semver. The 1.x line is the public API above.
- Tracks the MCP SDK's major version. A new SDK major ⇒ a new mcp-core major.
- Node ≥ 24. We use top-level `await` and ESM.

## What this lets `quillmark-mcp` look like

After the migration, `quillmark-mcp` keeps:

- `src/primitives/{listQuills,getSpecs,createDocument}.js` (Quillmark domain).
- `src/strategies/{DeliveryStrategy,RenderAndHostStrategy}.js` (Quillmark domain).
- `quills/` content.
- `src/bin.js` and `src/cli/` — argv, env, bind parsing, `config <client>`
  subcommand, install snippet generation, Docker hardening conventions.
  **All application code, all in this repo. Out of scope for `mcp-core`.**
- `src/mcp/createDefaultMCP.js` — wires Quiver + engine + strategy + tools
  onto an `mcp-core` server. No more `QuillmarkMCP` class.

A bespoke integration (Profile #2) keeps:

- Its own HTTP framework, listener, auth, and routing.
- A custom `DeliveryStrategy` (e.g., upload-to-platform-and-return-link).
- An `mcp-core` server mounted via `requestHandler()` at the route of its choice.
- No CLI, no Docker template, no install snippets — they ship how they
  already ship.

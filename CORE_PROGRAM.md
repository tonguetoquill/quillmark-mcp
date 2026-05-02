# mcp-core

A small, opinionated toolkit for building MCP servers in Node.js. Pure
utilities — no domain logic, framework, CLI, auth, or artifact serving.

## Why this exists

Every MCP server author rediscovers the same problems: stateless-HTTP
transport semantics, stdout contamination breaking stdio JSON-RPC,
result-wrapping quirks of `@modelcontextprotocol/sdk`, OAuth-probe
handling, and embedding the MCP endpoint into a host HTTP framework
without reaching past the SDK's public API.

`mcp-core` solves each once, with a flat API. It fills gaps the SDK
leaves; it doesn't invent abstractions on top.

## Consumers

Two profiles drive the API shape:

1. **Plug-and-play servers.** A standalone Node binary or Docker image
   doing stdio + stateless HTTP. Argv, env, install snippets, Docker
   conventions, auth, TLS, and artifact serving live in the consuming
   application — not here.
2. **Bespoke integrations.** A service that embeds the MCP endpoint in
   its own HTTP framework (Express, Fastify, Hono, serverless) and
   ships its own auth + delivery.

Both share the same primitives. Profile #2 must be able to **mount** the
endpoint into an existing HTTP server without `mcp-core` owning the
listener.

## Non-goals

The *what*; rationales for the major exclusions live under *Design decisions*.

- Tool registry, plugin system, DI container, `BaseServer` orchestrator.
- Domain-specific delivery strategies.
- Schema encoding helpers (TOON, JSON-Schema-to-Markdown, etc.).
- CLI scaffolding (argv, env, bind-strings, install snippets, Docker,
  per-client config).
- Authentication. Stacks *in front of* the MCP handler. For OAuth 2.1,
  embedded consumers wire `@modelcontextprotocol/sdk`'s
  `requireBearerAuth` and `mcpAuthMetadataRouter` directly
  (Express-shaped); standalone deployments front the listener with
  `oauth2-proxy`, an OIDC-aware ingress, or equivalent.
- Artifact serving. Consumers wire their own static handler.
- Structured logging library. Only stay-off-stdout ships.
- Transports the SDK doesn't ship.
- Telemetry, metrics, tracing hooks. Wrap `execute` if you want timing.
- Sessioned HTTP. Stateless is the only HTTP mode.

## Stack

- Node.js ≥ 24, ESM, top-level `await`.
- `@modelcontextprotocol/sdk`, `zod` — peer deps.
- Zero runtime deps beyond the peers.
- Plain JS source with handwritten `.d.ts` next to each module.

## Implementation discretion

This document captures *intent*. The non-goals above and the invariants
below are firm; everything else — module layout, exact wire formats for
non-MCP-spec details (404 body, logger output, error envelope text),
shape-check predicates, internal helper names — is guidance. If a
cleaner pattern surfaces in implementation, take it and update this doc.

**Invariants:**

- Three top-level exports: `createMcpServer(options) → adapter`,
  `logger`, `getErrorMessage`. The adapter exposes `addTool`, `start`,
  `stop`, `requestHandler`.
- In stdio mode, stdout is reserved for the SDK's JSON-RPC framing —
  library code, logger, and tool handlers must not write to it (any
  stray byte breaks the frame and the client disconnects).
- Stateless HTTP rebuilds the per-request `McpServer` (SDK requirement).
- Tool-handler exceptions never propagate to the transport — they
  surface as MCP tool-result errors.
- The embedded handler is `(req, res, next?) => void`, always responds,
  and never calls `next()`.
- Default standalone bind is `localhost`.
- Stateless HTTP is the only HTTP mode.

## Public API

### `createMcpServer(options) → adapter`

Wraps the SDK's `McpServer` with stateless-HTTP and stdio support and
the SDK quirks pre-solved.

```js
import { z } from 'zod';
import { createMcpServer } from 'mcp-core';

const server = createMcpServer({ name: 'myapp', version: '1.0.0' });

server.addTool({
  name: 'echo',
  description: 'Echo input.',
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});
```

`addTool({ name, description, parameters, execute })`:

- `name`: non-empty string, unique per adapter. `description`: string.
- `parameters`: zod object schema, translated to the SDK's `inputSchema`
  internally.
- `execute(args) → result | Promise<result>`. Return values wrap per
  *Behaviors*; thrown errors become MCP tool-result errors.

#### Standalone — own the HTTP listener

```js
await server.start({ transport: 'stdio' });
// or
await server.start({ transport: 'http', host: 'localhost', port: 8080, endpoint: '/mcp' });

await server.stop();
```

In `http` mode, `start()` runs a listener that routes the configured
`endpoint` to the MCP handler and returns a JSON 404 on every other path
(so OAuth-probing clients can parse and fall through). Path match is
exact, trailing slash collapsed. Method handling on the matched path is
delegated to the SDK's `StreamableHTTPServerTransport` in stateless mode.
Auth, TLS, CORS, and artifact serving are deployer concerns. Default
`host: 'localhost'`; network exposure is a deliberate decision.

#### Embedded — mount into a host framework

```js
import express from 'express';
import { createMcpServer } from 'mcp-core';

const app = express();
const server = createMcpServer({ name: 'myapp', version: '1.0.0' });
server.addTool(/* ... */);

app.use('/mcp', authMiddleware, server.requestHandler());
app.listen(8080);
```

`server.requestHandler()` returns a Node `(req, res, next?) => void`
handler — works in raw `http`, Express, Fastify (`fastify.use`), or any
serverless adapter exposing Node-shaped req/res. Mount it on the exact
path you want it to serve; it always responds and never calls `next()`.
The host framework owns lifecycle; auth stacks in front.

#### Behaviors

- Per-request `McpServer` rebuild for stateless HTTP; long-lived for stdio.
- Result wrapping: every return value stringifies into `content[0].text`;
  `structuredContent` is set only for plain records (intent: arrays,
  Maps, class instances, `null`, and primitives are excluded).
- Args normalize so `undefined` / `null` / non-objects arrive at
  `execute` as `{}`. Edge cases (e.g. arrays) are the implementer's call.
- JSON 404 on unmatched HTTP routes (OAuth probes parse it cleanly).
- `stop()` (standalone only): drains in-flight requests, closes the
  listener; for stdio, awaits SDK transport close. Idempotent. No forced
  deadline by default — consumers wrap in `Promise.race` if needed.

### `logger`

Stderr-only writer. Anything on stdout corrupts stdio JSON-RPC.

```js
import { logger } from 'mcp-core';
logger.info('started');
logger.error(new Error('boom'));
logger.debug('handling', { reqId: 'abc' });
```

- Reads `LOG_LEVEL` (default `info`). Levels: `error`, `warn`, `info`,
  `debug`.
- All output to `process.stderr`. Always.
- Format: one line per call, `<LEVEL> <message>` plus space-separated
  `JSON.stringify` of extras; `Error` rendered via `getErrorMessage`.
  Examples: `INFO started`, `DEBUG handling {"reqId":"abc"}`. Implementer
  may pick a clearer line shape — only stay-off-stdout is invariant.

### `getErrorMessage(error) → string`

Coerces any thrown value (Error, plain object, primitive) to a readable
string. Exported because every consumer needs it in `execute` handlers.

## Module layout

A sketch — consolidate or split as the implementation finds natural.

```
mcp-core/
  src/
    index.js                  # re-exports
    server/
      McpServer.js            # createMcpServer + adapter class
      requestHandler.js       # embedding seam (Node http handler)
      stringify.js            # result wrapping
      args.js                 # arg normalization
    logger.js
    errors.js                 # getErrorMessage
  test/
    *.test.js                 # node --test
```

## Design decisions

**One adapter, no orchestrator.** Tool registration belongs on the
adapter. Higher-level wrappers are the consumer's job.

**Tools live as closures.** No registry, no metadata indirection.
`addTool` pushes onto an internal array; per-request HTTP rebuilds
re-register the same closures.

**Embedding is a first-class shape.** Profile #2's host already owns
the listener. Forcing a second listener + reverse proxy, or reaching
past the SDK's public API, would defeat the library. Standalone and
embedded share every quirk-fix; only lifecycle ownership differs.

**Auth is composable, not built in.** Bearer / JWT / OAuth / mTLS /
IP-allowlist stack as middleware (embedded) or in front of the listener
(standalone). A shared-secret knob would imply security it can't
deliver, encourage public-internet exposure without a proxy, and break
compatibility when MCP OAuth 2.1 is wired in. `localhost` default is
the safe starting point.

**Artifact serving is not a core concern.** Most MCP servers return
data; the minority that produce files wire their own static handler.
Core inclusion would either commit to a full path-traversal / MIME /
range story or ship a half-measure consumers replace.

**Logger ships only the MCP-specific invariant.** Stdout corrupts stdio
JSON-RPC framing — that's the one rule. Format strings, structured
fields, transports, sampling, correlation IDs: out of scope.

**No "MCP" base class for tools.** Result wrapping is a single function
applied uniformly. Nothing to subclass.

**Fail fast on construction; never throw from tool handlers.** `addTool`
validates shape synchronously — name, description, parameters, execute
must each have the obvious type. Predicate details are implementer
discretion. At request time, exceptions in `execute` are caught and
surfaced as MCP tool-result errors via `getErrorMessage(err)`; the SDK
forbids transport-level throws inside tool dispatch.

**Stateless HTTP only.** Sessioned HTTP is more complex, harder to
scale, and rarely needed. Consumers who need sessions instantiate the
SDK directly.

**Peer-deps for SDK and zod.** Avoids version skew.

## Versioning

- Semver. 1.x is the public API above.
- Tracks the MCP SDK's major version: SDK major ⇒ mcp-core major.

## What this lets `quillmark-mcp` look like

`quillmark-mcp` keeps (all application code, out of scope for `mcp-core`):

- `src/primitives/{listQuills,getSpecs,createDocument}.js` (domain).
- `src/strategies/{DeliveryStrategy,RenderAndHostStrategy}.js` (domain).
- `quills/` content.
- `src/bin.js` + `src/cli/` — argv, env, bind parsing, `config <client>`,
  install snippets, Docker hardening.
- A path-traversal-guarded static-file handler for artifact downloads,
  in front of (standalone) or alongside (embedded) the MCP listener.
- Whatever auth the deployment requires, stacked in front of the handler.
- `src/mcp/createDefaultMCP.js` — wires Quiver + engine + strategy +
  tools onto an `mcp-core` server. No more `QuillmarkMCP` class.

A bespoke integration (Profile #2) brings its own HTTP framework,
listener, auth, routing, and `DeliveryStrategy`, and mounts an
`mcp-core` server via `requestHandler()` at its chosen route. No CLI,
Docker template, or install snippets — they ship how they already ship.

# @quillmark/mcp

A flat, TypeScript-first toolkit for building MCP servers in Node.js. Wraps `@modelcontextprotocol/sdk` to pre-solve its quirks (stateless-HTTP rebuild, result wrapping, OAuth-probe 404s, stdio stdout discipline) and exposes a raw `(req, res, next?)` handler that mounts into Express, Fastify, `node:http`, or any serverless adapter.

## Consumers

Two profiles drive the API shape; both share every primitive:

1. **Standalone.** Node binary or Docker image doing stdio + stateless HTTP. The library owns the listener; argv, env, install snippets, TLS, and auth fronting live in the consuming app.
2. **Embedded.** A service mounts the MCP endpoint into its own HTTP framework with its own auth and delivery, retaining lifecycle ownership.

## Stack

- Node.js ≥ 24, ESM, top-level `await`.
- `@modelcontextprotocol/sdk`, `zod` — peer deps. The SDK passes zod schemas through, so both must resolve the same instance; pin to the zod major the SDK is currently on (today: `zod ^3.23`).
- Zero runtime deps beyond peers.
- TypeScript source run directly via Node 24 strip-types. Type-check with `tsc --noEmit`; no build step.

## Invariants

These and the *Non-goals* are firm. Module layout, internal helper names, and exact wire formats for non-spec details (404 body shape, log line format, error envelope text) are implementer discretion — update this doc if a cleaner pattern surfaces.

- Three exports: `createMcpServer(options) → adapter`, `logger`, `getErrorMessage`. The adapter exposes `addTool`, `start`, `stop`, `requestHandler`.
- Stdio mode: stdout is reserved for SDK JSON-RPC framing. Library code, logger, and tool handlers never write to it — a single stray byte disconnects the client.
- Stateless HTTP rebuilds the per-request `McpServer` (SDK requirement).
- Tool-handler exceptions never reach the transport — they surface as MCP tool-result errors via `getErrorMessage`.
- The embedded handler is `(req, res, next?) => void`, always responds, never calls `next()`.
- Default standalone bind is `localhost`. Stateless is the only HTTP mode.

## Public API

### `createMcpServer(options) → adapter`

```ts
import { z } from 'zod';
import { createMcpServer } from '@quillmark/mcp';

const server = createMcpServer({ name: 'myapp', version: '1.0.0' });

server.addTool({
  name: 'echo',
  description: 'Echo input.',
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});
```

`createMcpServer({ name, version, instructions? })`:

- `name`, `version`: required strings, advertised in the MCP `initialize` response. `version` is a protocol requirement, not optional.
- `instructions`: optional free-form string surfaced to the client/LLM during `initialize` to guide when and how this server should be used.

`addTool({ name, description, parameters, execute })`:

- `name`: non-empty, unique per adapter. `description`: string.
- `parameters`: zod object schema; passed straight through to the SDK as `inputSchema`.
- `execute(args)` is typed as `(args: z.infer<typeof parameters>) => result | Promise<result>`. Return wrapped per *Behaviors*; thrown values become MCP tool-result errors.
- Shape is validated synchronously in `addTool` (fail fast at construction). Predicate details are implementer discretion.
- Registration closes at `start()`. Subsequent `addTool` calls throw — keeps the adapter's tool list immutable across the stdio lifetime and avoids `tools/list_changed` semantics.

#### Standalone

```ts
await server.start({ transport: 'stdio' });
// or
await server.start({ transport: 'http', host: 'localhost', port: 8080, endpoint: '/mcp' });
await server.stop();
```

In `http` mode, `start()` runs a `node:http` listener, exact-matches `endpoint` (trailing slash collapsed) to the MCP handler, and returns a JSON 404 elsewhere so OAuth-probing clients can parse and fall through. Method handling on the matched path is delegated to the SDK's `StreamableHTTPServerTransport`. Auth, TLS, CORS, and artifact serving are deployer concerns.

`stop()` drains in-flight requests and closes the listener; for stdio, awaits SDK transport close. Idempotent, no forced deadline — wrap in `Promise.race` if needed.

#### Embedded

```ts
import express from 'express';
import { mcpAuthMetadataRouter, requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createMcpServer } from '@quillmark/mcp';

const app = express();
const server = createMcpServer({ name: 'myapp', version: '1.0.0' });
server.addTool(/* ... */);

app.use(mcpAuthMetadataRouter({ /* provider config */ }));
app.use('/mcp', requireBearerAuth({ /* ... */ }), server.requestHandler());
app.listen(8080);
```

`server.requestHandler()` returns a `(req, res, next?) => void` handler usable by any Node-shaped framework. Mount on the exact path; it always responds and never calls `next()`. Host owns lifecycle; auth middleware stacks in front.

#### Behaviors

- Per-request `McpServer` rebuild for stateless HTTP; long-lived for stdio. Tools are stored as closures on the adapter and re-registered each rebuild.
- Result wrapping: every return stringifies into `content[0].text`; `structuredContent` is set only for plain records (arrays, Maps, class instances, `null`, primitives excluded).
- Args normalize so `undefined` / `null` / non-objects arrive at `execute` as `{}`. Edge cases (e.g. arrays) are implementer's call.

### `logger`

Stderr-only writer; reads `LOG_LEVEL` (default `info`; levels `error`/`warn`/`info`/`debug`). One line per call: `<LEVEL> <message>` plus space-separated `JSON.stringify` of extras, with `Error` rendered via `getErrorMessage`. Stay-off-stdout is the only invariant — line shape is up to the implementer.

```ts
import { logger } from '@quillmark/mcp';
logger.info('started');
logger.error(new Error('boom'));
logger.debug('handling', { reqId: 'abc' });
```

### `getErrorMessage(error) → string`

Coerces any thrown value (Error, plain object, primitive) to a readable string. Exported because every `execute` handler needs it.

## Non-goals

- MCP resources and prompts. V1 is tools-only; the SDK's `server.resource()` / `server.prompt()` cover those cleanly and have no quirks to gap-fill. `addResource` / `addPrompt` can land in a later minor version without breaking the existing API.
- Non-text tool outputs (images, audio, resource references). Every return renders into `content[0].text`.
- Tool registry, plugin system, DI container, `BaseServer` orchestrator. Tool registration is one method on the adapter; higher-level wrappers belong to the consumer.
- Domain-specific delivery, artifact serving, schema encoding helpers (TOON, JSON-Schema-to-Markdown). Wire your own static handler for files.
- CLI scaffolding (argv, env, bind-strings, install snippets, Docker, per-client config).
- Authentication. Stack the SDK's `requireBearerAuth` / `mcpAuthMetadataRouter` as `(req, res, next)` middleware in front of `requestHandler()`, or front the standalone listener with `oauth2-proxy` / OIDC ingress. The MCP client drives the OAuth flow with the provider; the server only validates tokens. Browser clients (Claude.ai web, ChatGPT connectors) require full OAuth 2.1 discovery, so the consuming app must host or proxy authorization-server endpoints; stdio / Claude Desktop deployments can use env-var bearer tokens. A built-in auth knob would imply guarantees the library can't deliver.
- Structured logging beyond stay-off-stdout. Telemetry / metrics / tracing — wrap `execute` if you want timing.
- Transports the SDK doesn't ship.
- Sessioned HTTP. Consumers who need sessions instantiate the SDK directly.

## Module layout

Sketch — consolidate or split as natural.

```
@quillmark/mcp/
  src/
    index.ts                  # re-exports
    server/
      McpServer.ts            # createMcpServer + adapter class
      requestHandler.ts       # embedding seam (Node http handler)
      standalone.ts           # start() / stop() for HTTP + stdio
      stringify.ts            # result wrapping
      args.ts                 # arg normalization
    logger.ts
    errors.ts                 # getErrorMessage
  test/
    *.test.ts                 # node --test
```

## Versioning

Semver; 1.x is the API above. Tracks the MCP SDK's major: SDK major ⇒ `@quillmark/mcp` major.

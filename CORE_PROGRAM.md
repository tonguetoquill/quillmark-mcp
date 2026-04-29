# mcp-core

A small, opinionated toolkit for building MCP servers in Node.js.

Pure utilities. No domain logic. No framework. Consumers stay in control.

## Why this exists

Every MCP server author rediscovers the same handful of non-obvious problems:
stateless-HTTP transport semantics, stdout contamination breaking stdio JSON-RPC,
result-wrapping quirks of `@modelcontextprotocol/sdk`, path-traversal hardening
for artifact serving, env/CLI precedence, and pasting install snippets into
five different client config formats.

`mcp-core` solves each of those once, in one place, with a flat API. It does
not invent abstractions on top of the SDK; it fills the gaps the SDK leaves.

## Non-goals

- No tool registry, plugin system, or DI container.
- No "BaseServer" orchestrator class. Consumers register tools on the adapter directly.
- No domain-specific delivery strategies. Consumers own their tool logic.
- No schema encoding helpers (TOON, JSON-Schema-to-Markdown, etc.) — those are
  domain choices.
- No support for transports the SDK doesn't ship (we follow the SDK's lead).

## Stack

- Node.js ≥ 24
- `@modelcontextprotocol/sdk` (peer dep)
- `zod` (peer dep — used for tool input schemas)
- `loglevel`
- Zero runtime deps beyond the above.

## Public API

Five entry points. Each does one thing.

### `createMcpServer(options) → McpServer`

The transport adapter. Wraps the SDK's `McpServer` with stateless-HTTP and
stdio support and the SDK quirks pre-solved.

```js
import { createMcpServer } from 'mcp-core';

const server = createMcpServer({ name: 'myapp', version: '1.0.0' });

server.addTool({
  name: 'echo',
  description: 'Echo input.',
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});

await server.start({ transport: 'stdio' });
// or
await server.start({
  transport: 'http',
  host: 'localhost',
  port: 8080,
  endpoint: '/mcp',
  authToken: process.env.AUTH_TOKEN,        // optional Bearer
  staticRoutes: [{ urlPath: '/files', dir: '/data' }], // optional
});

await server.stop();
```

Owns:
- Per-request `McpServer` rebuild for stateless HTTP (the SDK forbids reuse).
- Long-lived `McpServer` for stdio.
- Tool result wrapping: `stringifyToolResult` for `content[0].text`,
  `structuredContent` only when the return value is a plain record.
- `normalizeToolArgs`: never destructures `undefined`/`null`/primitives.
- Optional Bearer auth on the MCP endpoint.
- Optional static routes with directory-traversal protection (rejects `..`,
  separators in filenames, and resolved-path escapes; sets `Content-Type`
  from a small MIME map; `Content-Disposition: attachment`).
- JSON 404 on unmatched HTTP routes (so OAuth-probing clients don't crash).
- Graceful `stop()` for both transports.

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

### `runCli(spec) → Promise<void>`

CLI scaffolding. Parses argv + env with `cli > env > default` precedence,
wires the bind string, builds your server, starts it, and exposes the
`config <client>` subcommand.

```js
import { runCli, createMcpServer } from 'mcp-core';

await runCli({
  name: 'myapp',
  envPrefix: 'MYAPP_',
  defaults: { bind: 'localhost:8080', endpoint: '/mcp' },
  flags: {
    'output-dir': { type: 'string', env: 'OUTPUT_DIR', default: '.artifacts' },
  },
  build: async (config) => {
    const server = createMcpServer({ name: 'myapp', version: '1.0.0' });
    server.addTool(/* ... */);
    return {
      server,
      staticRoutes: [{ urlPath: '/artifacts', dir: config['output-dir'] }],
    };
  },
  clientSnippet: {                                  // optional
    image: 'myapp:dev',
    stdioEnv: { MYAPP_STDIO: '1' },
    artifactsEnvVar: 'MYAPP_OUTPUT_DIR',
  },
});
```

Owns:
- `parseBind(host:port)` with IPv6 support (last-colon split).
- `pick(cli, env, default)` precedence helper.
- `--stdio` flag and `<PREFIX>_STDIO=1` env var.
- The `config <client> [--mode http|stdio]` subcommand wiring.
- Dependency injection seams (`cwd`, `env`, `consoleLog`, `consoleError`,
  `setExitCode`) for testability — same pattern as the existing `bin.js`.

### `generateClientSnippet(options) → Snippet`

Pure function. Returns a paste-ready config snippet for a given MCP client.

```js
import { generateClientSnippet } from 'mcp-core/clients';

const snippet = generateClientSnippet({
  client: 'claude-code',          // 'claude-code' | 'codex'
  mode: 'http',                   // 'http' | 'stdio'
  serverName: 'myapp',
  url: 'http://127.0.0.1:8080/mcp',
  authToken: '...',               // optional
  docker: {                       // required for mode: 'stdio'
    image: 'myapp:dev',
    env: { MYAPP_STDIO: '1' },
    volumes: [{ host: '/data', container: '/data' }],
    args: ['--stdio'],
  },
});

// snippet: { format: 'shell' | 'toml', content, suggestedPath?, notes? }
```

Owns:
- Hardened `docker run` flags (`--user 10001:10001`, `--read-only`,
  `--tmpfs /tmp`, `--cap-drop=ALL`, `--security-opt=no-new-privileges:true`).
- Client-specific output format (Claude Code: `claude mcp add` shell command;
  Codex: TOML block).
- Bearer token wiring per client (`--header` for Claude, `bearer_token_env_var`
  for Codex).

No I/O. No file writes. The CLI subcommand prints the snippet; the user pastes.

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
      stringify.js            # result wrapping (stringifyToolResult, isPlainRecord)
      args.js                 # normalizeToolArgs
      static.js               # serveFile + path-traversal guard
    logger.js
    cli/
      run.js                  # runCli
      parse.js                # parseBind, pick, resolveDir
    clients/
      index.js                # generateClientSnippet
      docker.js               # dockerRunArgs (hardened defaults)
      claudeCode.js
      codex.js
    errors.js                 # getErrorMessage
  docker/
    Dockerfile.template       # parameterized hardened base image
  test/
    *.test.js                 # node --test
```

## Design decisions

**One adapter, no orchestrator.** The previous design had a `QuillmarkMCP`
class wrapping the adapter. It added one indirection without owning any
behavior — tool registration belongs on the adapter. Consumers register
tools directly. If they want a higher-level wrapper, they write one.

**Tools live as closures.** No tool registry, no metadata indirection.
`server.addTool(tool)` pushes the tool onto an internal array; per-request
HTTP rebuilds re-register the same closures. The quiver/engine/strategy
pattern from the consumer becomes "whatever you closed over."

**Static routes belong on the server, not in `start()`.** The previous
design accepted `artifactsDir` only via `start({ httpStream: { ... } })`.
That hides the route from anyone reading the construction code. New
shape: `staticRoutes: [{ urlPath, dir }]` passed to `start()` or registered
via `server.addStaticRoute(...)` at construction time. Both work.

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
- Node ≥ 24. We use `node:util parseArgs`, top-level `await`, and ESM.

## What this lets `quillmark-mcp` look like

After the migration, `quillmark-mcp` keeps:

- `src/primitives/{listQuills,getSpecs,createDocument}.js` (Quillmark domain)
- `src/strategies/{DeliveryStrategy,RenderAndHostStrategy}.js` (Quillmark domain)
- `quiver/` content
- `src/bin.js` — ~30 lines calling `runCli({ build })`.
- `src/mcp/createDefaultMCP.js` — wires Quiver + engine + strategy + tools
  onto an `mcp-core` server. No more `QuillmarkMCP` class.

Everything else moves into `mcp-core` or is deleted.

## Out of scope (explicitly)

- OAuth flows beyond Bearer-token check.
- Session-aware HTTP transport.
- Schema generation/encoding utilities.
- Tool authoring DSLs.
- Docker image build automation (we ship a template, not a builder).
- Install/uninstall scripts (those stay per-project — they're 20 lines of bash).

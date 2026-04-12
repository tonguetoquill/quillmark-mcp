## Modules

<dl>
<dt><a href="#bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.module_">bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.</a></dt>
<dd></dd>
<dt><a href="#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_">config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</a></dt>
<dd></dd>
<dt><a href="#index
Public API surface of the quillmark-mcp package.

Re-exports the two primary entry points consumers need_
- {@link createDefaultMCP} — factory that wires up a fully-configured MCP server instance.
- {@link DeliveryStrategy} — abstract base class for artifact delivery strategies.module_">index
Public API surface of the quillmark-mcp package.

Re-exports the two primary entry points consumers need:
- {@link createDefaultMCP} — factory that wires up a fully-configured MCP server instance.
- {@link DeliveryStrategy} — abstract base class for artifact delivery strategies.</a></dt>
<dd></dd>
<dt><a href="#logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
Defaults to `info`.module_">logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
Defaults to `info`.</a></dt>
<dd></dd>
<dt><a href="#mcp/createDefaultMCP
Factory for assembling a production-ready QuillmarkMCP with default dependencies.module_">mcp/createDefaultMCP
Factory for assembling a production-ready QuillmarkMCP with default dependencies.</a></dt>
<dd></dd>
<dt><a href="#mcp
Public API for the Quillmark MCP server layer.
Re-exports the orchestrator class and its default factory.module_">mcp
Public API for the Quillmark MCP server layer.
Re-exports the orchestrator class and its default factory.</a></dt>
<dd></dd>
<dt><a href="#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_">mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</a></dt>
<dd></dd>
<dt><a href="#mcp/QuillmarkMCP
Orchestrator that wires a QuillRegistry, a DeliveryStrategy, and an MCP server
adapter together, exposing Quillmark capabilities as MCP tools.module_">mcp/QuillmarkMCP
Orchestrator that wires a QuillRegistry, a DeliveryStrategy, and an MCP server
adapter together, exposing Quillmark capabilities as MCP tools.</a></dt>
<dd></dd>
<dt><a href="#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_">composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.</a></dt>
<dd></dd>
<dt><a href="#module_createDocument">createDocument</a></dt>
<dd></dd>
<dt><a href="#module_getSpecs">getSpecs</a></dt>
<dd></dd>
<dt><a href="#primitives

Public API surface for Quillmark MCP primitives.

Re-exports the three core operations that MCP tool handlers delegate to_
- {@link listQuills} — enumerate available Quill document formats
- {@link getSpecs} — retrieve schema + authoring instructions for a Quill
- {@link createDocument} — validate and persist a Quillmark document

All primitives accept a registry as their first argument and are designed
to be strategy-agnostic (the persistence mechanism is injected, not owned).module_">primitives

Public API surface for Quillmark MCP primitives.

Re-exports the three core operations that MCP tool handlers delegate to:
- {@link listQuills} — enumerate available Quill document formats
- {@link getSpecs} — retrieve schema + authoring instructions for a Quill
- {@link createDocument} — validate and persist a Quillmark document

All primitives accept a registry as their first argument and are designed
to be strategy-agnostic (the persistence mechanism is injected, not owned).</a></dt>
<dd></dd>
<dt><a href="#module_listQuills">listQuills</a></dt>
<dd></dd>
<dt><a href="#strategies/DeliveryStrategy
Defines the strategy pattern contract for document delivery.
All delivery mechanisms (render-to-file, upload-to-S3, etc.) extend this base class.module_">strategies/DeliveryStrategy
Defines the strategy pattern contract for document delivery.
All delivery mechanisms (render-to-file, upload-to-S3, etc.) extend this base class.</a></dt>
<dd></dd>
<dt><a href="#strategies
Re-exports all delivery strategy implementations.
Consumers should import from this barrel rather than reaching into individual files.module_">strategies
Re-exports all delivery strategy implementations.
Consumers should import from this barrel rather than reaching into individual files.</a></dt>
<dd></dd>
<dt><a href="#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_">strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.</a></dt>
<dd></dd>
</dl>

<a name="bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.module_"></a>

## bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.
<a name="bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.module_..pick"></a>

### bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.~pick(cliValue, envValue, fallback) ⇒ <code>\*</code>
Selects the first defined, non-empty value using CLI > env > fallback precedence.

**Kind**: inner method of [<code>bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.</code>](#bin
CLI entry point — parses args/env, dispatches to config generators or starts the MCP server.module_)  
**Returns**: <code>\*</code> - The resolved value.  

| Param | Type | Description |
| --- | --- | --- |
| cliValue | <code>\*</code> | Value from parsed CLI flag (wins if not `undefined`). |
| envValue | <code>\*</code> | Value from environment variable (wins if defined and non-empty). |
| fallback | <code>\*</code> | Default value when neither source provides one. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_"></a>

## config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.

* [config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)
    * [~DEFAULTS](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..DEFAULTS) : <code>Object</code>
    * [~SUPPORTED](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..SUPPORTED) : <code>Object.&lt;string, Array.&lt;string&gt;&gt;</code>
    * [~dockerRunArgs(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..dockerRunArgs) ⇒ <code>Array.&lt;string&gt;</code>
    * [~authHeaderJson(authToken)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..authHeaderJson) ⇒ <code>object</code> \| <code>null</code>
    * [~indentJson(obj)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..indentJson) ⇒ <code>string</code>
    * [~claudeCode(mode, ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..claudeCode) ⇒ <code>ConfigSnippet</code>
    * [~claudeDesktop(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..claudeDesktop) ⇒ <code>ConfigSnippet</code>
    * [~cursor(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..cursor) ⇒ <code>ConfigSnippet</code>
    * [~vscode(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..vscode) ⇒ <code>ConfigSnippet</code>
    * [~cline(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..cline) ⇒ <code>ConfigSnippet</code>
    * [~continueClient(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..continueClient) ⇒ <code>ConfigSnippet</code>
    * [~codex(mode, ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..codex) ⇒ <code>ConfigSnippet</code>
    * [~chatgpt(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..chatgpt) ⇒ <code>ConfigSnippet</code>
    * [~openaiResponses(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..openaiResponses) ⇒ <code>ConfigSnippet</code>
    * [~openaiAgents(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..openaiAgents) ⇒ <code>ConfigSnippet</code>
    * [~ollamaMcphostServerEntry(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcphostServerEntry) ⇒ <code>object</code>
    * [~ollamaMcphost(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcphost) ⇒ <code>ConfigSnippet</code>
    * [~ollamaMcpo(ctx)](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcpo) ⇒ <code>ConfigSnippet</code>
    * [~ConfigSnippet](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ConfigSnippet) : <code>Object</code>

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..DEFAULTS"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~DEFAULTS : <code>Object</code>
Default values used when the caller does not override a field.
Kept in one place so snapshot tests can assert against them directly.

**Kind**: inner constant of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | MCP server name registered with the client (`"quillmark"`). |
| url | <code>string</code> | Local HTTP endpoint; loopback-only by default for security. |
| artifactsDir | <code>string</code> | Host path bind-mounted into Docker for rendered output.                                   Uses `$HOME` shell variable so it stays portable across users. |
| image | <code>string</code> | Docker image tag. `:dev` so local builds Just Work without a registry push. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..SUPPORTED"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~SUPPORTED : <code>Object.&lt;string, Array.&lt;string&gt;&gt;</code>
Maps each supported client name to its allowed transport modes.

- `"http"` — client connects to a running HTTP server (Streamable HTTP / SSE).
- `"stdio"` — client spawns a Docker container and communicates over stdin/stdout.

Not every client supports both. Claude Desktop, for example, cannot reach localhost
via its cloud connector, so only stdio is offered. Codex and Claude Code support both.

**Kind**: inner constant of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..dockerRunArgs"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~dockerRunArgs(ctx) ⇒ <code>Array.&lt;string&gt;</code>
Builds the `docker run` argument array for stdio-mode containers.
Shared by every client that supports stdio transport.

Security flags applied:
- `--user 10001:10001` — runs as non-root UID.
- `--read-only` + `--tmpfs /tmp` — immutable rootfs, ephemeral scratch.
- `--cap-drop=ALL` — drops every Linux capability.
- `--security-opt=no-new-privileges:true` — prevents suid/sgid escalation.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Returns**: <code>Array.&lt;string&gt;</code> - Ordered args array suitable for `docker ...args`.  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> |  |
| ctx.artifactsDir | <code>string</code> | Host path bind-mounted at the same path inside the container. |
| ctx.image | <code>string</code> | Docker image tag to run. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..authHeaderJson"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~authHeaderJson(authToken) ⇒ <code>object</code> \| <code>null</code>
Returns an auth header object for JSON config blobs, or `null` if no token.
Clients that embed headers as a JSON property (Cursor, VS Code, Cline, Continue) use this.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Returns**: <code>object</code> \| <code>null</code> - Object with shape `{headers: {Authorization: string}}`, or null if no token.  

| Param | Type | Description |
| --- | --- | --- |
| authToken | <code>string</code> \| <code>undefined</code> | Bearer token, or falsy to skip. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..indentJson"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~indentJson(obj) ⇒ <code>string</code>
JSON pretty-printer (2-space indent). All JSON snippets use this for consistency.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Returns**: <code>string</code> - Pretty-printed JSON string (no trailing newline).  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>any</code> | Value to serialize. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..claudeCode"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~claudeCode(mode, ctx) ⇒ <code>ConfigSnippet</code>
Claude Code template. HTTP mode emits a `claude mcp add` shell command;
stdio mode emits `claude mcp add ... -- docker run ...`.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| mode | <code>&#x27;http&#x27;</code> \| <code>&#x27;stdio&#x27;</code> |  |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..claudeDesktop"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~claudeDesktop(ctx) ⇒ <code>ConfigSnippet</code>
Claude Desktop template (stdio only). Emits a `claude_desktop_config.json`
snippet with `command: "docker"` + args from [dockerRunArgs](dockerRunArgs).

Claude Desktop's cloud connector cannot reach localhost, so HTTP mode is
intentionally unsupported — stdio is the only viable path for local containers.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..cursor"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~cursor(ctx) ⇒ <code>ConfigSnippet</code>
Cursor template. Standard `mcpServers` JSON with optional auth headers.
Note: Cursor has a ~40-tool global cap across all MCP servers.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..vscode"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~vscode(ctx) ⇒ <code>ConfigSnippet</code>
VS Code Copilot Chat template. Uses `"servers"` key (NOT `"mcpServers"`) —
the single biggest copy-paste footgun in the MCP ecosystem. Includes
`type: "http"` which VS Code requires explicitly.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..cline"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~cline(ctx) ⇒ <code>ConfigSnippet</code>
Cline template. Standard `mcpServers` JSON, stored in VS Code extension
globalStorage rather than a user-visible project file.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..continueClient"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~continueClient(ctx) ⇒ <code>ConfigSnippet</code>
Continue template. Uses `type: "streamable-http"` explicitly — Continue
accepts Claude-Desktop-style JSON drop-ins but also recognizes the type field.
Agent mode only.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..codex"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~codex(mode, ctx) ⇒ <code>ConfigSnippet</code>
Codex CLI template. Emits TOML for `~/.codex/config.toml`.
HTTP mode uses `url` + optional `bearer_token_env_var`; stdio mode uses
`command` + `args` pointing at Docker.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| mode | <code>&#x27;http&#x27;</code> \| <code>&#x27;stdio&#x27;</code> |  |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..chatgpt"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~chatgpt(ctx) ⇒ <code>ConfigSnippet</code>
ChatGPT template. No machine-readable config — emits a human-readable
walkthrough because ChatGPT's custom MCP connector is configured through
the web UI, not a file. Includes tunnel guidance since ChatGPT runs in
OpenAI's cloud and cannot reach localhost.

Only available on Business/Team/Enterprise/Edu/Pro plans.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..openaiResponses"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~openaiResponses(ctx) ⇒ <code>ConfigSnippet</code>
OpenAI Responses API template. Emits a Node/TypeScript code sample using
the `type: 'mcp'` tool format in `client.responses.create()`.

This is the "hosted MCP" path — OpenAI's backend calls the MCP server
directly, so localhost URLs won't work without a tunnel.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..openaiAgents"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~openaiAgents(ctx) ⇒ <code>ConfigSnippet</code>
OpenAI Agents SDK template. Emits a Python code sample using
`MCPServerStreamableHttp` — the "local MCP" path where the SDK connects
directly, so localhost URLs work without a tunnel.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcphostServerEntry"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~ollamaMcphostServerEntry(ctx) ⇒ <code>object</code>
Builds a single MCPHost server entry object for the modern schema (>=0.33).
Uses `type: "remote"` for HTTP transport (MCPHost's term for Streamable HTTP).

Headers are an **array of strings** (`["Authorization: Bearer ..."]`), not
an object — this is MCPHost-specific and differs from every other client.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Returns**: <code>object</code> - MCPHost server entry with shape `{type: 'remote', url: string, headers?: string[]}`.  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |
| ctx.url | <code>string</code> | MCP server HTTP endpoint. |
| [ctx.authToken] | <code>string</code> | Optional Bearer token. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcphost"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~ollamaMcphost(ctx) ⇒ <code>ConfigSnippet</code>
Ollama/MCPHost template. Emits a human-readable walkthrough covering both
the automated `install-ollama.sh` path and manual setup (install mcphost,
pull a model, write `~/.mcphost.json`, run).

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ollamaMcpo"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~ollamaMcpo(ctx) ⇒ <code>ConfigSnippet</code>
Ollama/MCPO template (stdio). MCPO bridges stdio MCP servers to OpenAPI REST
endpoints that Open WebUI consumes as custom tools. Emits a walkthrough
with the `mcpo -- docker run ...` launch command.

For CLI-only Ollama without Open WebUI, prefer the MCPHost path instead.

**Kind**: inner method of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  

| Param | Type | Description |
| --- | --- | --- |
| ctx | <code>Object</code> | Resolved config context. |

<a name="config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_..ConfigSnippet"></a>

### config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.~ConfigSnippet : <code>Object</code>
Shape returned by every per-client template function.

**Kind**: inner typedef of [<code>config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.</code>](#config

Client-agnostic MCP config snippet generator.

Pure function. Given a target client and deployment mode, return the exact
config blob the developer needs to paste into that clients config file (or
run as a CLI command, or embed in code). No file I/O, no network, no Docker.

The caller owns resolving environment-dependent values (absolute
artifactsDir path, custom URL/port) and passes them in. The generator
itself only templates strings — this is what makes the golden snapshot
tests deterministic.

Every template here is covered by test/cli/config-snapshot.test.js.module_)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| format | <code>&#x27;json&#x27;</code> \| <code>&#x27;toml&#x27;</code> \| <code>&#x27;yaml&#x27;</code> \| <code>&#x27;text&#x27;</code> \| <code>&#x27;shell&#x27;</code> \| <code>&#x27;js&#x27;</code> \| <code>&#x27;python&#x27;</code> | Hint for the CLI to syntax-highlight the output. |
| suggestedPath | <code>string</code> \| <code>null</code> | File the user should paste into,   or `null` if the target is a CLI command / walkthrough / code sample. |
| content | <code>string</code> | The snippet to copy — always newline-terminated. |
| [notes] | <code>Array.&lt;string&gt;</code> | Short caveats printed alongside the snippet. |

<a name="index
Public API surface of the quillmark-mcp package.

Re-exports the two primary entry points consumers need_
- {@link createDefaultMCP} — factory that wires up a fully-configured MCP server instance.
- {@link DeliveryStrategy} — abstract base class for artifact delivery strategies.module_"></a>

## index
Public API surface of the quillmark-mcp package.

Re-exports the two primary entry points consumers need:
- {@link createDefaultMCP} — factory that wires up a fully-configured MCP server instance.
- {@link DeliveryStrategy} — abstract base class for artifact delivery strategies.
<a name="logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
Defaults to `info`.module_"></a>

## logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG\_LEVEL` env var to control verbosity (`trace` \| `debug` \| `info` \| `warn` \| `error` \| `silent`).
Defaults to `info`.
<a name="logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
Defaults to `info`.module_..level"></a>

### logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps &#x60;loglevel&#x60; with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set &#x60;LOG_LEVEL&#x60; env var to control verbosity (&#x60;trace&#x60; | &#x60;debug&#x60; | &#x60;info&#x60; | &#x60;warn&#x60; | &#x60;error&#x60; | &#x60;silent&#x60;).
Defaults to &#x60;info&#x60;.~level : <code>string</code>
Active log level, sourced from `LOG_LEVEL` env var or defaulting to `'info'`.

**Kind**: inner constant of [<code>logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps &#x60;loglevel&#x60; with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set &#x60;LOG\_LEVEL&#x60; env var to control verbosity (&#x60;trace&#x60; \| &#x60;debug&#x60; \| &#x60;info&#x60; \| &#x60;warn&#x60; \| &#x60;error&#x60; \| &#x60;silent&#x60;).
Defaults to &#x60;info&#x60;.</code>](#logger
Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.

Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
uppercased severity to every message. Supports plain strings, Error objects,
and structured metadata (object first, message rest).

Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
Defaults to `info`.module_)  
<a name="mcp/createDefaultMCP
Factory for assembling a production-ready QuillmarkMCP with default dependencies.module_"></a>

## mcp/createDefaultMCP
Factory for assembling a production-ready QuillmarkMCP with default dependencies.
<a name="mcp
Public API for the Quillmark MCP server layer.
Re-exports the orchestrator class and its default factory.module_"></a>

## mcp
Public API for the Quillmark MCP server layer.
Re-exports the orchestrator class and its default factory.
<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_"></a>

## mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.

* [mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)
    * [~stringifyToolResult(result)](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..stringifyToolResult) ⇒ <code>string</code>
    * [~normalizePath(urlPath)](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..normalizePath) ⇒ <code>string</code>
    * [~serveFile(res, artifactsDir, fileName)](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..serveFile) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~normalizeToolArgs(args)](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..normalizeToolArgs) ⇒ <code>Record.&lt;string, unknown&gt;</code>
    * [~isPlainRecord(value)](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..isPlainRecord) ⇒ <code>boolean</code>

<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..stringifyToolResult"></a>

### mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.~stringifyToolResult(result) ⇒ <code>string</code>
Serialize a tool's return value into a text string for the MCP `content` field.

Strings pass through unchanged; objects are JSON-stringified; anything else
is coerced via `String()`.

**Kind**: inner method of [<code>mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</code>](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)  
**Returns**: <code>string</code> - Serialized text representation.  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>unknown</code> | Raw return value from a tool's execute function. |

<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..normalizePath"></a>

### mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.~normalizePath(urlPath) ⇒ <code>string</code>
Strip a trailing slash from a URL path (unless it's the root `/`).
Ensures consistent route matching regardless of how clients format their requests.

**Kind**: inner method of [<code>mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</code>](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)  
**Returns**: <code>string</code> - Path without a trailing slash.  

| Param | Type | Description |
| --- | --- | --- |
| urlPath | <code>string</code> | URL pathname to normalize. |

<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..serveFile"></a>

### mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.~serveFile(res, artifactsDir, fileName) ⇒ <code>Promise.&lt;void&gt;</code>
Stream a rendered artifact file to an HTTP response.

Security: rejects any `fileName` containing path separators or `..` sequences
to prevent directory traversal. Additionally validates that the resolved path
stays within `artifactsDir` (belt-and-suspenders).

Sets `Content-Type` from a known MIME map, `Content-Disposition: attachment`,
and `Content-Length` for deterministic downloads.

**Kind**: inner method of [<code>mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</code>](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)  

| Param | Type | Description |
| --- | --- | --- |
| res | <code>object</code> | Node.js HTTP ServerResponse to write to. |
| artifactsDir | <code>string</code> | Absolute path to the artifacts directory. |
| fileName | <code>string</code> | Bare filename (no path components allowed). |

<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..normalizeToolArgs"></a>

### mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.~normalizeToolArgs(args) ⇒ <code>Record.&lt;string, unknown&gt;</code>
Coerce tool arguments to a plain object. Guards against undefined/null/primitive
args that would break destructuring in tool execute handlers.

**Kind**: inner method of [<code>mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</code>](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)  
**Returns**: <code>Record.&lt;string, unknown&gt;</code> - Guaranteed plain object.  

| Param | Type | Description |
| --- | --- | --- |
| args | <code>unknown</code> | Raw arguments from the MCP transport. |

<a name="mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_..isPlainRecord"></a>

### mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.~isPlainRecord(value) ⇒ <code>boolean</code>
Check whether a value is a plain object (record) suitable for the MCP
`structuredContent` field.

The MCP spec requires `structuredContent` to be a record — arrays and
primitives are not allowed. Only attach it when the tool returns a
plain object.

**Kind**: inner method of [<code>mcp/McpSdkServerAdapter
Adapts the MCP SDKs &#x60;McpServer&#x60; into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.</code>](#mcp/McpSdkServerAdapter
Adapts the MCP SDKs `McpServer` into a transport-agnostic server that
supports both long-lived stdio sessions and stateless HTTP request handling.

This is the most architecturally important file in the MCP layer — it owns
transport selection, per-request server lifecycle, auth, and artifact serving.module_)  
**Returns**: <code>boolean</code> - True if value is a non-null, non-array object.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>unknown</code> | Tool return value to test. |

<a name="mcp/QuillmarkMCP
Orchestrator that wires a QuillRegistry, a DeliveryStrategy, and an MCP server
adapter together, exposing Quillmark capabilities as MCP tools.module_"></a>

## mcp/QuillmarkMCP
Orchestrator that wires a QuillRegistry, a DeliveryStrategy, and an MCP server
adapter together, exposing Quillmark capabilities as MCP tools.
<a name="composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_"></a>

## composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.

* [composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.](#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_)
    * [~emitScalar(value)](#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_..emitScalar) ⇒ <code>string</code>
    * [~emitField(key, value)](#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_..emitField) ⇒ <code>Array.&lt;string&gt;</code>

<a name="composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_..emitScalar"></a>

### composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.~emitScalar(value) ⇒ <code>string</code>
Encodes a single value as a YAML scalar.

Delegates to `JSON.stringify` for strings (producing safe double-quoted
output) and for complex nested values (flow-style JSON, which is valid YAML).
Nulls, booleans, and numbers are stringified directly.

**Kind**: inner method of [<code>composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.</code>](#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_)  
**Returns**: <code>string</code> - YAML-safe scalar representation.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | The value to encode. |

<a name="composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_..emitField"></a>

### composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.~emitField(key, value) ⇒ <code>Array.&lt;string&gt;</code>
Emits zero or more YAML lines for a single key-value pair.

Returns an empty array for `undefined` (field omitted), a single line for
scalars/null/nested objects (flow-style), and multiple lines for arrays
(block-style with `- ` prefix). This multi-line return lets the caller
flatten all fields with a single `lines.push(...emitField(...))`.

**Kind**: inner method of [<code>composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON: strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.</code>](#composeYaml

Minimal JSON-to-YAML block-style emitter for frontmatter assembly.

Takes a plain JS object and emits valid YAML that parses back to equivalent
data. Exploits YAML 1.2 being a strict superset of JSON_ strings are emitted
as JSON-escaped double-quoted scalars, nested objects use JSON flow style,
and only top-level sequences are rendered in block style (for readability
when a human ends up editing the frontmatter).

Intentionally not a full YAML library — the input shape is controlled
(primitives, arrays of primitives/objects, nested objects) and that subset
is exactly what every frontmatter schema shipped so far uses.module_)  
**Returns**: <code>Array.&lt;string&gt;</code> - Lines of YAML output for this field.  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The YAML field name. |
| value | <code>\*</code> | The field value; `undefined` suppresses output entirely. |

<a name="module_createDocument"></a>

## createDocument

* [createDocument](#module_createDocument)
    * _static_
        * [.createDocument(registry, strategy, content)](#module_createDocument.createDocument) ⇒ <code>Promise.&lt;object&gt;</code>
    * _inner_
        * [~parseFrontmatter(content)](#module_createDocument..parseFrontmatter) ⇒ <code>Object.&lt;string, string&gt;</code>
        * [~formatError(message)](#module_createDocument..formatError) ⇒ <code>object</code>
        * [~getErrorMessage(error)](#module_createDocument..getErrorMessage) ⇒ <code>string</code>
        * [~stripYamlQuotes(value)](#module_createDocument..stripYamlQuotes) ⇒ <code>\*</code>
        * [~extractQuillRef(frontmatterFields)](#module_createDocument..extractQuillRef) ⇒ <code>string</code> \| <code>undefined</code>
        * [~validateWithEngine(registry, content)](#module_createDocument..validateWithEngine) ⇒ <code>Array.&lt;object&gt;</code>

<a name="module_createDocument.createDocument"></a>

### createDocument.createDocument(registry, strategy, content) ⇒ <code>Promise.&lt;object&gt;</code>
Validates and persists a Quillmark document through the full pipeline:

1. Validate `content` is a non-empty string
2. Parse frontmatter and extract the QUILL reference
3. Resolve the QUILL ref against the registry
4. Run WASM engine dry-run validation (schema + business rules)
5. Delegate to the injected strategy for persistence (e.g. GitHub, filesystem)

Non-throwing by design: every failure is returned as a structured
`{ status: 'error', errors: [...] }` response rather than a thrown
exception. This is intentional — MCP tool handlers should never throw
because the protocol has no concept of exceptions; errors must be
expressed as tool results.

**Kind**: static method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>Promise.&lt;object&gt;</code> - Success or structured error result (`{ status, url?, errors? }`). Error messages from Maps and objects are serialised via `getErrorMessage`.  

| Param | Type | Description |
| --- | --- | --- |
| registry | <code>object</code> | The package registry used to resolve the QUILL ref and validate via WASM.   Must expose `resolve(ref)` returning a Promise and optionally `engine.dryRun(content)`. |
| strategy | <code>object</code> | The persistence strategy that receives the resolved quill bundle and validated content.   Must expose `handle(quill, validatedContent)` returning a Promise. |
| content | <code>string</code> | Full Quillmark document: YAML frontmatter (with QUILL: key) + markdown body. |

<a name="module_createDocument..parseFrontmatter"></a>

### createDocument~parseFrontmatter(content) ⇒ <code>Object.&lt;string, string&gt;</code>
Extracts YAML frontmatter fields from a Quillmark document string.

Uses a regex to match the `---`-delimited block at the start of the content,
then parses it line-by-line with a naive `key: value` splitter. This is NOT
a full YAML parser — it handles flat key-value pairs only. Comment lines
(starting with `#`) and blank lines are skipped. Enough to extract the QUILL
ref and surface-level metadata before the real WASM engine validates the
full document.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>Object.&lt;string, string&gt;</code> - Flat map of frontmatter key-value pairs, or `{}` if no frontmatter block is found.  

| Param | Type | Description |
| --- | --- | --- |
| content | <code>string</code> | Raw Quillmark document string. |

<a name="module_createDocument..formatError"></a>

### createDocument~formatError(message) ⇒ <code>object</code>
Builds a structured error result matching the createDocument return shape.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>object</code> - `{ status: 'error', errors: [{ message }] }`  

| Param | Type | Description |
| --- | --- | --- |
| message | <code>string</code> | Human-readable error description. |

<a name="module_createDocument..getErrorMessage"></a>

### createDocument~getErrorMessage(error) ⇒ <code>string</code>
Coerces an arbitrary error value into a human-readable string.

Handles the full zoo of things the WASM engine and strategy layer can
throw: standard Error instances, Map objects (field-level validation errors
where keys are field names and values are messages), plain objects
(JSON-serialised), and primitives (stringified). Map handling is critical
because the validation engine surfaces per-field errors as Map entries.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>string</code> - A best-effort human-readable error message.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>unknown</code> | The thrown/returned error value. |

<a name="module_createDocument..stripYamlQuotes"></a>

### createDocument~stripYamlQuotes(value) ⇒ <code>\*</code>
Strips surrounding flow-style YAML quotes (single or double) from a string.

Only affects the naive pre-extraction path used by `extractQuillRef` — the
real WASM YAML parser handles quoting correctly on its own. Without this,
a frontmatter value like `QUILL: "my-quill"` would fail resolution because
the quotes would be treated as part of the ref.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>\*</code> - The value with surrounding quotes removed if applicable, or the original value.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | The raw frontmatter value token. |

<a name="module_createDocument..extractQuillRef"></a>

### createDocument~extractQuillRef(frontmatterFields) ⇒ <code>string</code> \| <code>undefined</code>
Looks up the QUILL key in parsed frontmatter fields (case-insensitive)
and returns its quote-stripped value.

Case-insensitive lookup lets authors write `quill:`, `Quill:`, or `QUILL:`
interchangeably, reducing friction.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>string</code> \| <code>undefined</code> - The Quill format reference, or `undefined` if not present.  

| Param | Type | Description |
| --- | --- | --- |
| frontmatterFields | <code>Object.&lt;string, string&gt;</code> | Parsed frontmatter key-value map. |

<a name="module_createDocument..validateWithEngine"></a>

### createDocument~validateWithEngine(registry, content) ⇒ <code>Array.&lt;object&gt;</code>
Runs the WASM engine's dry-run validation against the full document content.

Non-throwing: returns an empty array on success or if no engine is available,
and a single-element error array on validation failure. This keeps the
validation step composable within the main pipeline without try/catch noise.

**Kind**: inner method of [<code>createDocument</code>](#module_createDocument)  
**Returns**: <code>Array.&lt;object&gt;</code> - Empty on success, error descriptors (`{ message }`) on failure.  

| Param | Type | Description |
| --- | --- | --- |
| registry | <code>object</code> | Registry with optional WASM engine exposing `engine.dryRun(content)`. |
| content | <code>string</code> | Full Quillmark document string to validate. |

<a name="module_getSpecs"></a>

## getSpecs

* [getSpecs](#module_getSpecs)
    * _static_
        * [.getSpecs(registry, ref, [deps])](#module_getSpecs.getSpecs) ⇒ <code>Promise.&lt;object&gt;</code>
    * _inner_
        * [~extractInstructions(quillInfo)](#module_getSpecs..extractInstructions) ⇒ <code>string</code>

<a name="module_getSpecs.getSpecs"></a>

### getSpecs.getSpecs(registry, ref, [deps]) ⇒ <code>Promise.&lt;object&gt;</code>
Resolves a Quill format reference and returns its schema (TOON-encoded)
plus authoring instructions for LLM consumption.

The schema is encoded via TOON (a compact, token-efficient serialisation)
so it fits within LLM context windows without wasting tokens on JSON
verbosity. The encoder can be overridden via `deps.encodeSchema` for
testing or alternative serialisation formats.

Throws on every failure path (invalid ref, resolution failure, missing
engine) — callers are expected to catch and surface errors to the user.

**Kind**: static method of [<code>getSpecs</code>](#module_getSpecs)  
**Returns**: <code>Promise.&lt;object&gt;</code> - TOON-encoded schema + authoring instructions (`{ schema, instructions }`).  
**Throws**:

- <code>Error</code> If `ref` is empty, resolution fails, or the registry lacks a WASM engine.


| Param | Type | Description |
| --- | --- | --- |
| registry | <code>object</code> | The package registry with an attached WASM engine. Must expose `resolve(ref)` returning   `Promise<{ name }>` and optionally `engine` with `getStrippedSchema(name)` and `getQuillInfo(name)`. |
| ref | <code>string</code> | Identifier for the Quill format (e.g. package name or name@version). |
| [deps] | <code>object</code> | Injectable dependencies; defaults to TOON encoder. May include `encodeSchema(schema)`. |

<a name="module_getSpecs..extractInstructions"></a>

### getSpecs~extractInstructions(quillInfo) ⇒ <code>string</code>
Extracts authoring instructions from a resolved Quill's metadata.

Fallback chain: `quillInfo.example` (preferred, typically a full sample
document) → `quillInfo.metadata.instructions` (prose guidance) → empty
string. This lets Quill authors ship either a concrete example or free-form
instructions, with the example taking priority when both exist.

**Kind**: inner method of [<code>getSpecs</code>](#module_getSpecs)  
**Returns**: <code>string</code> - Authoring instructions, or `''` if none are available.  

| Param | Type | Description |
| --- | --- | --- |
| quillInfo | <code>object</code> | Object with optional `example` (string) and optional `metadata.instructions` (string). |

<a name="primitives

Public API surface for Quillmark MCP primitives.

Re-exports the three core operations that MCP tool handlers delegate to_
- {@link listQuills} — enumerate available Quill document formats
- {@link getSpecs} — retrieve schema + authoring instructions for a Quill
- {@link createDocument} — validate and persist a Quillmark document

All primitives accept a registry as their first argument and are designed
to be strategy-agnostic (the persistence mechanism is injected, not owned).module_"></a>

## primitives

Public API surface for Quillmark MCP primitives.

Re-exports the three core operations that MCP tool handlers delegate to:
- {@link listQuills} — enumerate available Quill document formats
- {@link getSpecs} — retrieve schema + authoring instructions for a Quill
- {@link createDocument} — validate and persist a Quillmark document

All primitives accept a registry as their first argument and are designed
to be strategy-agnostic (the persistence mechanism is injected, not owned).
<a name="module_listQuills"></a>

## listQuills
<a name="module_listQuills.listQuills"></a>

### listQuills.listQuills(registry) ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>
Lists installed Quill formats (document templates) from the registry.

Non-throwing by design: registry failures (network, WASM init, corrupt
packages) are swallowed and produce an empty array so the MCP tool layer
always returns a valid response. Descriptions are normalised to strings —
missing or non-string descriptions become `''` to guarantee a uniform
shape for downstream consumers.

**Kind**: static method of [<code>listQuills</code>](#module_listQuills)  
**Returns**: <code>Promise.&lt;Array.&lt;object&gt;&gt;</code> - Resolved list of quills (`{ name: string, description: string }`) with normalised descriptions, or `[]` on any error.  

| Param | Type | Description |
| --- | --- | --- |
| registry | <code>object</code> | The package registry that can enumerate installed Quill formats.   Must expose `getAvailableQuills()` returning `Promise<Array<{ name, description }>>`. |

<a name="strategies/DeliveryStrategy
Defines the strategy pattern contract for document delivery.
All delivery mechanisms (render-to-file, upload-to-S3, etc.) extend this base class.module_"></a>

## strategies/DeliveryStrategy
Defines the strategy pattern contract for document delivery.
All delivery mechanisms (render-to-file, upload-to-S3, etc.) extend this base class.
<a name="strategies
Re-exports all delivery strategy implementations.
Consumers should import from this barrel rather than reaching into individual files.module_"></a>

## strategies
Re-exports all delivery strategy implementations.
Consumers should import from this barrel rather than reaching into individual files.
<a name="strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_"></a>

## strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.

* [strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.](#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_)
    * [~getErrorMessage(error)](#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_..getErrorMessage) ⇒ <code>string</code>
    * [~extensionFromMimeType(mimeType, fallback)](#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_..extensionFromMimeType) ⇒ <code>string</code>

<a name="strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_..getErrorMessage"></a>

### strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.~getErrorMessage(error) ⇒ <code>string</code>
Extract a human-readable error message from heterogeneous error types.

Handles the full spectrum of values that can land in a catch block:
Error instances, Map objects (from WASM validation), plain objects, and primitives.

**Kind**: inner method of [<code>strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.</code>](#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_)  
**Returns**: <code>string</code> - A string suitable for user-facing error responses.  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>unknown</code> | The caught value. |

<a name="strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_..extensionFromMimeType"></a>

### strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.~extensionFromMimeType(mimeType, fallback) ⇒ <code>string</code>
Map a MIME type to a file extension for the rendered artifact.

Only covers the output formats the WASM engine currently produces.
Falls back to the caller-supplied default when the MIME type is unrecognized.

**Kind**: inner method of [<code>strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.</code>](#strategies/RenderAndHostStrategy
Concrete delivery strategy that renders Quillmark content via the WASM engine
and writes the resulting artifact to disk, returning a reachable URL.module_)  
**Returns**: <code>string</code> - File extension without a leading dot.  

| Param | Type | Description |
| --- | --- | --- |
| mimeType | <code>string</code> | MIME type from the render artifact (e.g. 'application/pdf'). |
| fallback | <code>string</code> | Extension to use when mimeType is not in the known set. |


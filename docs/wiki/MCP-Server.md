# MCP Server — McpSdkServerAdapter

`McpSdkServerAdapter` is the transport layer of Quillmark's MCP integration. It bridges the official `@modelcontextprotocol/sdk` into two runtime modes — stateless HTTP and long-lived stdio — while handling authentication, artifact serving, and tool result formatting.

**Source:** `src/mcp/McpSdkServerAdapter.js`

---

## Class Overview

```
McpSdkServerAdapter
  ├── addTool(tool)          Register a tool for MCP exposure
  ├── start(options?)        Bind to stdio or HTTP
  └── stop()                 Graceful shutdown
```

The adapter wraps the SDK's `McpServer` class. It does **not** implement tool logic — that lives in `QuillmarkMCP`, which calls `addTool()` for each primitive. The adapter's job is:

1. Store tool definitions in an internal array (`this.tools`).
2. Register each tool on whatever `McpServer` instance is active.
3. Manage transport lifecycle (stdio pipe or HTTP listener).
4. Serve rendered artifact files with path traversal protection.
5. Optionally enforce Bearer token authentication on HTTP requests.

---

## Constructor

```js
const adapter = new McpSdkServerAdapter({
  name: 'Quillmark',   // Server name in MCP handshake (default: 'Quillmark')
  version: '1.0.0',    // Server version in MCP handshake (default: '1.0.0')
});
```

The constructor creates a long-lived `McpServer` instance (used by stdio mode) and initializes an empty `tools` array. No transport is started until `start()` is called.

---

## The Stateless HTTP Pattern

This is the most architecturally significant design decision in the MCP layer.

### The Problem

The SDK's `StreamableHTTPServerTransport` has an internal flag `_hasHandledRequest` that flips to `true` after the first HTTP request. Once set, the transport **cannot be reused** for another request. This is by design in the SDK — a stateless transport is meant to handle exactly one request cycle.

If you tried to share a single `McpServer` + `StreamableHTTPServerTransport` across multiple HTTP requests, you would get:

- **Concurrent client collisions:** Two requests hitting the same transport simultaneously would corrupt each other's state.
- **Reconnect failures:** A client disconnecting and reconnecting would find a spent transport that refuses new requests.

### The Solution: Fresh Server Per Request

Every inbound HTTP request to the MCP endpoint gets a **brand new** `McpServer` and `StreamableHTTPServerTransport`:

```js
// Inside the HTTP request handler:
const requestServer = this.#buildRequestServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,   // stateless — no session tracking
  enableJsonResponse: true,
});

try {
  await requestServer.connect(transport);
  await transport.handleRequest(req, res);
} finally {
  await requestServer.close().catch(() => {});
}
```

`#buildRequestServer()` creates a fresh `McpServer` and re-registers every tool from the stored `this.tools` array:

```js
#buildRequestServer() {
  const server = new McpServer({ name: this.name, version: this.version });
  for (const tool of this.tools) {
    this.#registerToolOn(server, tool);
  }
  return server;
}
```

### Why This Is Cheap

Tool registration is lightweight because the heavyweight objects — the `QuillRegistry`, the `DeliveryStrategy`, and the WASM engine — live as **closures** on each tool's `execute` function. They were captured when `QuillmarkMCP.registerTools()` created the tool definitions. Rebuilding the `McpServer` just re-wires the SDK's internal routing table; it does not reinitialize WASM or reload quill packages.

### Implications

| Property | Guarantee |
|---|---|
| Concurrent clients | Never collide — each gets its own server + transport |
| Reconnects | Always succeed — no stale transport state to clear |
| Memory | Each request-scoped server is closed in the `finally` block |
| Tool consistency | All requests see the same tool set (from `this.tools`) |

---

## Stdio Mode

Stdio mode is the simpler path. A single long-lived `McpServer` is connected to a `StdioServerTransport` and runs until the process exits:

```js
if (transportType === 'stdio') {
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  return;
}
```

One process = one session. There is no per-request lifecycle, no auth, and no artifact serving. This is the mode used by Claude Code and Claude Desktop when they launch Quillmark as a child process.

Tools are registered once on `this.server` (the long-lived instance) via `addTool()` at construction time.

---

## Artifact Serving

When running in HTTP mode, the adapter can serve rendered document artifacts (PDFs, SVGs, etc.) from a configured directory.

### Configuration

```js
await adapter.start({
  transportType: 'httpStream',
  httpStream: {
    artifactsDir: '/absolute/path/to/.artifacts',
    artifactsPath: '/artifacts',   // URL prefix (default)
  },
});
```

A request to `GET /artifacts/memo-abc123.pdf` serves the file from `artifactsDir/memo-abc123.pdf`.

### Path Traversal Protection

The `serveFile` function applies two layers of defense:

1. **Input validation:** Rejects any `fileName` containing `/`, `\`, or `..`. Only bare filenames are accepted.

```js
if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
  res.statusCode = 400;
  res.end('Bad Request');
  return;
}
```

2. **Resolved path check (belt-and-suspenders):** After `path.join()`, verifies the resolved path starts with `artifactsDir + path.sep`. This catches edge cases the string check might miss.

```js
if (!filePath.startsWith(artifactsDir + path.sep)) {
  res.statusCode = 403;
  res.end('Forbidden');
  return;
}
```

### MIME Types

| Extension | Content-Type |
|---|---|
| `.pdf` | `application/pdf` |
| `.svg` | `image/svg+xml` |
| `.txt` | `text/plain` |
| *(other)* | `application/octet-stream` |

All responses include `Content-Disposition: attachment` and `Content-Length` headers.

### Error Responses

- **400 Bad Request** — path traversal attempt in filename
- **403 Forbidden** — resolved path escapes the artifacts directory
- **404 Not Found** — file does not exist (`ENOENT`)
- **500 Internal Server Error** — any other filesystem error

---

## Authentication

HTTP mode supports optional Bearer token authentication. When `authToken` is set, every request to the MCP endpoint is checked before dispatch:

```js
await adapter.start({
  transportType: 'httpStream',
  httpStream: {
    authToken: 'my-secret-token',
  },
});
```

The check:

```js
if (authToken) {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== authToken) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return;
  }
}
```

- Auth applies **only** to the MCP endpoint, not artifact serving.
- When no `authToken` is configured, all requests pass through.
- Non-MCP routes (e.g., OAuth discovery probes like `/.well-known/oauth-protected-resource`) get a JSON `{"error":"not_found"}` 404 response so MCP clients can parse the body and fall through gracefully.

---

## Tool Result Wrapping

When a tool's `execute` function returns a value, the adapter wraps it into MCP's expected response format using two helpers.

### stringifyToolResult

Serializes the raw return value into a text string for the `content[].text` field:

```js
function stringifyToolResult(result) {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}
```

### structuredContent

If the tool returns a plain object (not an array, not null, not a primitive), it is also attached as `structuredContent` for clients that support typed responses:

```js
const response = {
  content: [{ type: 'text', text: stringifyToolResult(result) }],
};
if (isPlainRecord(result)) {
  response.structuredContent = result;
}
return response;
```

This means every tool response has at minimum a `content` array with a text block. Clients that understand `structuredContent` get the parsed object directly; others parse the JSON from the text field.

---

## Full start() Options

```js
await adapter.start({
  transportType: 'httpStream',  // or 'stdio' (default)
  httpStream: {
    host: 'localhost',          // bind address (default: 'localhost')
    port: 8080,                 // listen port (default: 8080)
    endpoint: '/mcp',           // MCP endpoint path (default: '/mcp')
    authToken: 'secret',        // optional Bearer token
    artifactsDir: '/path/to',   // absolute path for artifact serving
    artifactsPath: '/artifacts', // URL prefix for artifacts (default)
  },
});
```

Throws `Error` if `transportType` is neither `'stdio'` nor `'httpStream'`.

# Getting Started

This guide gets you from zero to a running quillmark-mcp server with a verified MCP connection. Assumes macOS or Linux.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| **Node.js** | >= 24 | `node --version` |
| **Docker** | Any modern release | `docker --version` |
| **Docker Compose plugin** | Any | `docker compose version` |

Node 24 is required for ESM support, `node --test`, and built-in `fetch`. Docker is used for the default deployment model.

---

## Clone, install, test

```sh
git clone https://github.com/nibsbin/quillmark-mcp.git
cd quillmark-mcp
npm install
```

Verify the install:

```sh
npm test
```

This runs ~40 unit tests in under a second via `node --test`. All should pass. No Docker needed for this step.

---

## Start the server

```sh
docker compose up -d
```

This builds the image (first run takes a few minutes), starts the HTTP server on `127.0.0.1:8080/mcp`, and creates the artifact volume.

Check it's healthy:

```sh
docker compose ps
```

You should see `quillmark-mcp` with status `Up` and `(healthy)`.

---

## Verify it works

Send an MCP `initialize` request:

```sh
curl -s http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "curl-test", "version": "0.0.1" }
    }
  }'
```

You should get back a JSON response with `"serverInfo": { "name": "Quillmark" }` and a list of capabilities.

List the available tools:

```sh
curl -s http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

You should see `list_quills`, `get_specs`, and `create_document`.

---

## Run the stdio smoke test

This is the debug anchor from `CONTRIBUTING.md`. It spawns a fresh container via stdio, lists tools, renders the bundled USAF memo, and confirms the PDF lands on disk.

Save this as `/tmp/quillmark-smoke.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const artifactsDir = `${process.env.HOME}/.quillmark/artifacts`;
const transport = new StdioClientTransport({
  command: 'docker',
  args: [
    'run', '-i', '--rm',
    '--user', '10001:10001',
    '--read-only', '--tmpfs', '/tmp',
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '-v', `${artifactsDir}:${artifactsDir}`,
    '-e', `QUILLMARK_OUTPUT_DIR=${artifactsDir}`,
    '-e', 'QUILLMARK_BASE_URL=file://',
    '-e', 'QUILLMARK_STDIO=1',
    'quillmark-mcp:dev',
    '--stdio',
  ],
});
const client = new Client({ name: 'smoke', version: '0.0.1' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log('tools:', tools.map(t => t.name).join(', '));
const memo = await readFile('quills/usaf_memo/0.2.0/example.md', 'utf8');
const result = await client.callTool({ name: 'create_document', arguments: { content: memo } });
const body = result.structuredContent ?? JSON.parse(result.content[0].text);
console.log('url:', body.url);
const filePath = body.url.replace(/^file:\/\//, '');
if (!existsSync(filePath)) throw new Error(`PDF not at ${filePath}`);
console.log('file on disk:', statSync(filePath).size, 'bytes');
await client.close();
```

Run it from the repo root:

```sh
mkdir -p ~/.quillmark/artifacts
node /tmp/quillmark-smoke.mjs
```

Expected output:

```
tools: list_quills, get_specs, create_document
url: file:///Users/<you>/.quillmark/artifacts/usaf_memo-<uuid>.pdf
file on disk: <size> bytes
```

If this passes, the server works end-to-end. If it fails, check `docker compose logs` or rerun with `LOG_LEVEL=debug`.

---

## Connect your MCP client

Generate a config snippet for your client:

```sh
node src/bin.js config claude-code
# or: node src/bin.js config cursor
# or: node src/bin.js config vscode
```

Paste the output into your client's config file. The full list of supported clients:

```sh
node src/bin.js config --help
# Clients: claude-code, claude-desktop, cursor, vscode, cline, continue,
#          codex, chatgpt, openai-responses, openai-agents,
#          ollama-mcphost, ollama-mcpo
```

Per-client walkthroughs with exact snippets, verification steps, and troubleshooting live in `docs/clients/`.

---

## Tear down

```sh
docker compose down                              # stop + remove containers
./scripts/uninstall-mcp.sh --yes                 # same thing via the script
./scripts/uninstall-mcp.sh --yes --purge         # also remove image + volume + host artifacts
```

---

## What next?

- **[Architecture Overview](Architecture-Overview.md)** -- System design, data flow, the stateless HTTP pattern, sidecar architecture.
- **[API Reference](API-Reference.md)** -- Auto-generated JSDoc for every exported function and class.
- **Testing** -- See `CONTRIBUTING.md` for the five test layers and which to run for which change.
- **Delivery strategies** -- Subclass `DeliveryStrategy` to add S3, CDN, or custom artifact hosting. See `README.md` section "Delivery strategies".
- **Client docs** -- `docs/clients/index.md` for the comparison table and per-client setup.

# quillmark-mcp

MCP server and composable primitives for [Quillmark](https://quillmark.readthedocs.io/en/latest/) — schematized document rendering for LLM consumers.

## Requirements

Node.js >= 24

## Install

```sh
npm install quillmark-mcp
```

## Usage

### Use with Claude Code

Start the server, then register it with Claude Code over streamable HTTP:

```sh
# 1. Start the server (binds to http://localhost:8080/mcp by default)
npx quillmark-mcp

# 2. Register it with Claude Code
claude mcp add --transport http quillmark http://localhost:8080/mcp
```

Customize the bind address with `--bind {host}:{port}` and `--endpoint`. The `--http`
flag is accepted for explicitness but streamable HTTP is the default (and only)
CLI transport.

### Plug-and-play MCP server (library)

```js
import { createDefaultMCP, PassThroughStrategy } from 'quillmark-mcp';

const strategy = new PassThroughStrategy(async (quill, content) => {
  // deliver content to your service, return { status, url?, errors? }
  return { status: 'ok', url: 'https://example.com/doc/123' };
});

const mcp = createDefaultMCP({ quillsDir: './quills', strategy });
await mcp.start({
  transportType: 'httpStream',
  httpStream: { host: 'localhost', port: 8080, endpoint: '/mcp' },
});
```

### Custom MCP server

`QuillmarkMCP` is the base class: it takes a pre-built `{ registry, strategy, server }` and registers Quillmark tools on the server. Use it when you need to swap the registry, server, or add your own tools.

See [`src/mcp/createDefaultMCP.js`](src/mcp/createDefaultMCP.js) for the reference wiring — copy it as a starting point and replace pieces as needed.

### Composable primitives

```js
import { listQuills, getSpecs, createDocument } from 'quillmark-mcp/primitives';
import { PassThroughStrategy } from 'quillmark-mcp/strategies';
import { FileSystemSource, QuillRegistry } from '@quillmark/registry';
import { Quillmark, init } from '@quillmark/wasm';

init();
const registry = new QuillRegistry({
  source: new FileSystemSource('./quills'),
  engine: new Quillmark(),
});

const quills = await listQuills(registry);
const specs = await getSpecs(registry, 'usaf_memo');
const result = await createDocument(registry, strategy, content);
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_quills` | List available quills with names and descriptions |
| `get_specs` | Get TOON-encoded schema and authoring instructions for a quill |
| `create_document` | Create a document from Quillmark content (YAML frontmatter + markdown body) |

`create_document` expects content with a `QUILL:` field in YAML frontmatter. If missing, it returns a structured error for agent self-repair.

## Delivery Strategies

| Strategy | Behavior |
|----------|----------|
| `PassThroughStrategy` | Delegates to a provided handler function |
| `RenderAndHostStrategy` | Renders via `@quillmark/wasm`, serves artifact, returns download URL |

To implement a custom strategy, extend `DeliveryStrategy` and implement `handle(quill, validatedContent)`.

## License

Apache 2.0

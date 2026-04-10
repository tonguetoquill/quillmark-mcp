# quillmark-mcp

MCP server and composable primitives for [Quillmark](https://quillmark.readthedocs.io/en/latest/) — schematized document rendering for LLM consumers.

## Requirements

Node.js >= 25

## Install

```sh
npm install quillmark-mcp
```

## Usage

### Plug-and-play MCP server

```js
import { QuillmarkMCP, PassThroughStrategy } from 'quillmark-mcp';

const strategy = new PassThroughStrategy(async (quill, content) => {
  // deliver content to your service, return { status, url?, errors? }
  return { status: 'ok', url: 'https://example.com/doc/123' };
});

const mcp = new QuillmarkMCP({
  quillsDir: './quills',
  strategy,
});

await mcp.start(); // stdio by default
```

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

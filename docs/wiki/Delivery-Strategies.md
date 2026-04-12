# Delivery Strategies

The strategy layer (`src/strategies/`) implements the Strategy pattern for document delivery. The MCP server delegates final document production to whatever `DeliveryStrategy` is injected at construction time, decoupling validation from persistence.

Barrel export: `src/strategies/index.js` re-exports `DeliveryStrategy` and `RenderAndHostStrategy`.

---

## `DeliveryStrategy` (Abstract Base)

**Location:** `src/strategies/DeliveryStrategy.js`

Abstract base class that defines the contract all delivery mechanisms must satisfy.

### The `handle` Contract

```js
async handle(quill, validatedContent) -> Promise<Result>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `quill` | `object` | Resolved quill object containing `name` (string), `version` (string), `data` (TOML blob), and `metadata` (object). |
| `validatedContent` | `string` | Quillmark content string (YAML frontmatter + markdown body) that has already passed schema validation via the primitives layer. |

**Return type:**

```ts
{
  status: 'success' | 'error',
  url?: string,           // artifact location (on success)
  errors?: Array<{ message: string }>  // (on failure)
}
```

The base implementation always throws `Error('DeliveryStrategy.handle() must be implemented by subclass')` to enforce the contract at runtime. Subclasses **must** override this method.

### Example

```js
import { DeliveryStrategy } from './strategies/index.js';

// This will throw -- you must subclass:
const base = new DeliveryStrategy();
await base.handle(quill, content);
// Error: DeliveryStrategy.handle() must be implemented by subclass
```

---

## `RenderAndHostStrategy`

**Location:** `src/strategies/RenderAndHostStrategy.js`

Concrete strategy that renders Quillmark content to a file artifact (PDF, SVG, TXT) via the WASM engine and writes it to disk, returning a reachable URL.

### Constructor

```js
new RenderAndHostStrategy(options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `path.resolve(process.cwd(), '.artifacts')` | Directory for rendered files. Created recursively if missing. |
| `baseUrl` | `string` | `'file://'` | URL prefix for artifact links. Use `'file://'` for local access or an HTTP base when serving remotely. |
| `format` | `string` | `'pdf'` | Target render format passed to the WASM engine. |

The constructor calls `init()` (WASM initialization) and creates a new `Quillmark` engine instance immediately.

### Rendering Pipeline

`handle(quill, validatedContent)` executes the following steps:

```
registerQuill (if version changed)
  -> Quillmark.parseMarkdown(validatedContent)
    -> engine.render(parsed, { format, quillRef })
      -> mkdir(outputDir, { recursive: true })
        -> writeFile(outputPath, artifact.bytes)
          -> generate URL
```

1. **Register quill** -- Checks if the engine already has this quill loaded at the correct version. If not (or version mismatch), calls `engine.registerQuill(quill.data)` with the TOML blob. The lookup tries `name@version` first, then falls back to `name` alone.

2. **Parse markdown** -- `Quillmark.parseMarkdown(validatedContent)` parses the frontmatter + body into the engine's internal representation.

3. **Render** -- `engine.render(parsed, { format, quillRef })` produces an artifact array. The first artifact's `.bytes` and `.mimeType` are used.

4. **Write file** -- Creates `outputDir` recursively if needed, writes the artifact bytes.

5. **Generate URL** -- Constructs the artifact URL from `baseUrl` and the file name.

### Artifact Naming

Files are named `{quill-name}-{uuid}.{ext}`:

```
memo-a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf
```

- `quill-name` -- the resolved quill's `name` property
- `uuid` -- `crypto.randomUUID()` prevents collisions when the same quill is rendered multiple times
- `ext` -- derived from the artifact's MIME type:

| MIME type | Extension |
|-----------|-----------|
| `application/pdf` | `pdf` |
| `image/svg+xml` | `svg` |
| `text/plain` | `txt` |
| (anything else) | Falls back to `options.format` value |

### URL Generation

| `baseUrl` value | Generated URL |
|-----------------|---------------|
| `'file://'` (default) | `file:///absolute/path/to/.artifacts/memo-uuid.pdf` |
| `'http://localhost:8080/artifacts'` | `http://localhost:8080/artifacts/memo-uuid.pdf` |

Trailing slashes on `baseUrl` are normalized (stripped before joining).

### Error Handling

This method **never throws**. All rendering failures are caught and returned as structured error responses:

```js
{
  status: 'error',
  errors: [{ message: 'Render result did not include any artifacts.' }]
}
```

Error messages are extracted via an internal `getErrorMessage` helper that handles `Error` instances, `Map` objects (from WASM validation), plain objects (`JSON.stringify`), and primitives (`String()`).

### Example

```js
import { RenderAndHostStrategy } from './strategies/index.js';

// Local file output (default):
const local = new RenderAndHostStrategy();
const result = await local.handle(quill, validatedContent);
// { status: 'success', url: 'file:///cwd/.artifacts/memo-<uuid>.pdf' }

// HTTP-served artifacts:
const remote = new RenderAndHostStrategy({
  outputDir: '/var/artifacts',
  baseUrl: 'https://docs.example.com/artifacts',
  format: 'svg',
});
const result = await remote.handle(quill, validatedContent);
// { status: 'success', url: 'https://docs.example.com/artifacts/memo-<uuid>.svg' }

// Rendering failure:
const result = await strategy.handle(badQuill, badContent);
// { status: 'error', errors: [{ message: '...' }] }
```

---

## Implementing a Custom Strategy

To add a new delivery mechanism (e.g. upload to S3, post to an API, send via email), extend `DeliveryStrategy` and override `handle`:

```js
import { DeliveryStrategy } from './strategies/DeliveryStrategy.js';

export class S3UploadStrategy extends DeliveryStrategy {
  constructor({ bucket, region, prefix = '' }) {
    super();
    this.bucket = bucket;
    this.region = region;
    this.prefix = prefix;
  }

  async handle(quill, validatedContent) {
    try {
      // 1. Render or transform the content as needed
      const key = `${this.prefix}${quill.name}-${Date.now()}.pdf`;

      // 2. Upload to your target
      await s3Client.putObject({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(validatedContent),
      });

      // 3. Return success with a URL
      return {
        status: 'success',
        url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
      };
    } catch (error) {
      // 4. Never throw -- return structured errors
      return {
        status: 'error',
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
      };
    }
  }
}
```

### Strategy Contract Checklist

- **Override `handle(quill, validatedContent)`** -- the base class throws if you forget.
- **Return `{ status, url?, errors? }`** -- always include `status`. Include `url` on success, `errors` on failure.
- **Never throw** -- wrap everything in try/catch and return `{ status: 'error', errors: [...] }`. The MCP protocol has no concept of exceptions; errors must be expressed as tool results.
- **`errors` is an array of `{ message: string }`** -- each entry must have a `message` property.

### Injecting Your Strategy

Strategies are injected when constructing the MCP server. The `createDocument` primitive receives the strategy as its second argument:

```js
import { createDocument } from './primitives/index.js';

const strategy = new S3UploadStrategy({
  bucket: 'my-docs',
  region: 'us-east-1',
});

const result = await createDocument(registry, strategy, content);
```

At the server level, the strategy is passed to `QuillmarkMCP` or `createDefaultMCP`, which wires it into all `createDocument` calls automatically.

# Quill System

A **Quill** is a schematized document template -- a self-contained package that defines a document's structure, validation rules, typesetting logic, and rendering assets. When an LLM agent (or a human) writes a Quillmark document, the QUILL reference in the YAML frontmatter selects which template to apply. The engine validates the content against the Quill's schema, then renders it to PDF (or SVG/text) via the WASM backend.

## Directory Structure

Each Quill lives under `quills/{name}/{version}/`:

```
quills/
  usaf_memo/
    0.2.0/
      Quill.yaml          # schema + metadata
      example.md          # sample document (used by get_specs for LLM instructions)
      plate.typ           # Typst plate file (the rendering template)
      .quillignore        # files to exclude from packaging
      assets/             # images, seals, logos
        dow_seal.png
      packages/           # vendored Typst packages
        tonguetoquill-usaf-memo/
          typst.toml
          src/
            lib.typ
            config.typ
            frontmatter.typ
            body.typ
            ...
          fonts/
            NimbusRomanNo9L/
            Cinzel/
            CopperplateCC/
  static_analysis_report/
    0.1.0/
      Quill.yaml
      example.md
      plate.typ
      packages/
        ttq-static-analysis-report/
          ...
```

## Quill.yaml Anatomy

The `Quill.yaml` file is the schema definition. It has three top-level sections:

### `Quill` -- Metadata

```yaml
Quill:
  name: usaf_memo
  version: 0.2.0
  backend: typst
  plate_file: plate.typ
  example_file: example.md
  description: Typesetted USAF Official Memorandum
```

| Key | Type | Description |
|---|---|---|
| `name` | string | Unique identifier for the Quill |
| `version` | string (semver) | Version of this Quill definition |
| `backend` | string | Rendering backend (`typst` is the only backend today) |
| `plate_file` | string | Entry-point template file for rendering |
| `example_file` | string | Sample document used for LLM authoring instructions |
| `description` | string | Human-readable description |

### `main.fields` -- Document Schema

Each field under `main.fields` defines a frontmatter key the document author must or may provide:

```yaml
main:
  fields:
    subject:
      title: Subject of the memo
      type: string
      required: true
      examples:
        - Subject of the Memorandum
      description: Be brief and clear.
      ui:
        group: Addressing

    date:
      title: Date of memo (YYYY-MM-DD)
      type: string
      default: ""
      description: YYYY-MM-DD. Leave blank to use today's date.
      ui:
        group: Additional

    classification:
      title: Classification level
      type: string
      default: ""
      enum:
        - CONFIDENTIAL
        - SECRET
        - TOP SECRET
```

| Field Property | Type | Description |
|---|---|---|
| `title` | string | Human-readable label |
| `type` | string | `string`, `number`, `array` |
| `required` | boolean | Whether the field must be present (default: false) |
| `default` | any | Default value if omitted |
| `enum` | array | Allowable values (validated at render time) |
| `examples` | array | Sample values for documentation and LLM prompting |
| `description` | string | Guidance for the document author |
| `ui.group` | string | Logical grouping for UI rendering |

### `cards` -- Repeatable Sections (Optional)

Some Quills define repeatable sub-documents called **cards**. For example, `usaf_memo` has an `indorsement` card for routing endorsements, each with its own `from`, `for`, `signature_block`, `format` (with enum: `standard`, `informal`, `separate_page`), and `action` fields.

## Lifecycle: Discovery to Rendering

### 1. Discovery

`FileSystemSource` (from `@quillmark/registry`) scans the `quills/` directory, reading each `{name}/{version}/Quill.yaml` to build a manifest of available Quills.

```js
import { FileSystemSource, QuillRegistry } from '@quillmark/registry';

const source = new FileSystemSource(quillsDir);
const registry = new QuillRegistry({ source, engine });
const manifest = await registry.getManifest();
// manifest.quills => [{ name: 'usaf_memo', version: '0.2.0' }, ...]
```

### 2. Resolution

When a tool call references a Quill (e.g. `get_specs` with ref `usaf_memo`), the registry resolves it:

```js
const bundle = await registry.resolve('usaf_memo');
// bundle => { name: 'usaf_memo', version: '0.2.0', data: <Buffer> }
```

The resolved bundle is then registered with the WASM engine so it has the template data available for schema inspection and rendering.

### 3. Validation

The WASM engine's `dryRun` method validates a full document (frontmatter + body) against the Quill's schema:

```js
const engine = registry.engine;
engine.dryRun(content);  // throws on validation failure
```

In `createDocument`, this is wrapped in a non-throwing helper that returns an error array:

```js
function validateWithEngine(registry, content) {
  try {
    registry.engine.dryRun(content);
    return [];  // success
  } catch (error) {
    return [{ message: getErrorMessage(error) }];
  }
}
```

Validation errors from the WASM engine can be `Error` instances, `Map` objects (field-level errors where keys are field names), or plain objects -- all are normalized to `{ message: string }`.

### 4. Rendering

The `RenderAndHostStrategy` handles the full render pipeline:

```
parseMarkdown(content) -> render(parsed, { format, quillRef }) -> artifacts
```

```js
import { Quillmark } from '@quillmark/wasm';

// Parse the markdown+frontmatter into a structured object
const parsed = Quillmark.parseMarkdown(validatedContent);

// Render to the target format (PDF, SVG, etc.)
const renderResult = engine.render(parsed, {
  format: 'pdf',
  quillRef: quill.name,
});

// Extract the artifact bytes
const artifact = renderResult.artifacts[0];
// artifact => { bytes: Uint8Array, mimeType: 'application/pdf' }
```

The rendered artifact is written to disk as `<quill-name>-<uuid>.pdf` and a URL is returned -- either `file://<path>` for local mode or `<baseUrl>/<fileName>` when served over HTTP.

## How to Create a New Quill

### Step 1: Scaffold the directory

```
quills/
  my_template/
    0.1.0/
      Quill.yaml
      example.md
      plate.typ
      packages/
        ttq-my-template/
          typst.toml
          src/
            lib.typ
```

### Step 2: Write `Quill.yaml`

Define the metadata block and every field your template needs:

```yaml
Quill:
  name: my_template
  version: "0.1.0"
  backend: typst
  plate_file: plate.typ
  example_file: example.md
  description: My custom document template

main:
  fields:
    title:
      title: Document title
      type: string
      required: true
    author:
      title: Author name
      type: string
      default: ""
```

### Step 3: Write `plate.typ`

This is the Typst entry point that imports your package and lays out the document. It receives the parsed frontmatter fields as Typst variables.

### Step 4: Write `example.md`

Create a complete sample document with YAML frontmatter. This is served to LLM agents via `get_specs` as authoring instructions:

```markdown
---
QUILL: my_template
title: Example Document
author: Jane Doe
---

Body content goes here.
```

### Step 5: Verify

```sh
npm test                    # unit tests pick up the new Quill via FileSystemSource
node src/bin.js --stdio &   # start the server
# use an MCP client to call list_quills, get_specs, create_document
```

## Shipped Quills

| Quill | Version | Description |
|---|---|---|
| `usaf_memo` | `0.2.0` | USAF Official Memorandum with letterhead, signature blocks, classification banners, indorsement routing cards |
| `static_analysis_report` | `0.1.0` | Cybersecurity assessment report for weapon system and mission software baselines -- cover page, scorecard, binary analysis, dependency audit, network reconnaissance |

# quillmark-mcp

[![CI](https://github.com/nibsbin/quillmark-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/nibsbin/quillmark-mcp/actions/workflows/ci.yml)
[![Node 24+](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](./.nvmrc)

A universal MCP server that surfaces [Quillmark](https://github.com/nibsbin/quillmark) document rendering as three tools. Drop a Quill template into `quills/` and any MCP client can list it, inspect its schema, and render documents from it.

## Tools

- **`list_quills`** — discover available Quill formats. Returns `[{ name, description }]`.
- **`get_specs`** — get the schema + authoring instructions for one Quill. Returns TOON-encoded schema.
- **`create_document`** — render a document from YAML frontmatter + markdown. Returns `{ status, url?, errors? }`.

### Shipped quills

| Quill | Description |
|---|---|
| `nyt_news_article` | NYT-style broadsheet news article |
| `cnn_news_article` | CNN-style web news article |
| `static_analysis_report` | Cybersecurity assessment report |
| `usaf_memo` | AFH 33-337 official USAF memorandum |
| `x_post` | X (Twitter) feed mockup — multi-post, replies, quoted tweets, Community Notes. Three themes (dim/light/lights_out). SVG engagement icons. |
| `discord_chat` | Discord channel transcript — messages, embeds, reactions, system events. Sentinel tokens for mentions/spoilers. Dark/legacy/light themes. |
| `usaf_intel_brief` | USAF/DoD landscape 16:9 intel briefing — CAPCO classification banners, portion marks, ICD 203 confidence/likelihood visuals, AOR bands, severity badges, INT-source pills, doctrine slide types (BLUF, Threat, MLCOA/MDCOA, I&W, Confidence, Gaps). Real DoD/USAF/USSF seals. |

Add your own by dropping a directory under `quills/` — no code changes needed.

## Quick start — Claude Code

```sh
./scripts/install-mcp.sh --target claude-code
```

Builds the Docker image, starts the server on `http://127.0.0.1:8080/mcp`, and prints the `claude mcp add` command. Paste it, then ask Claude to "render the nyt_news_article example."

## Quick start — Codex

```sh
./scripts/install-mcp.sh --target codex
```

Same flow; the printed snippet goes into `~/.codex/config.toml`.

## Other clients

The server implements the MCP standard over HTTP (Streamable) and stdio. Any conformant MCP client connects directly:

```
HTTP:  http://127.0.0.1:8080/mcp
stdio: docker run -i --rm quillmark-mcp:dev --stdio
```
## Uninstall

Simply run:

```sh
./scripts/uninstall-mcp.sh --yes --purge
```

The environment will be cleaned and Docker will ```compose down```.
## Architecture

```
MCP client → @modelcontextprotocol/sdk → QuillmarkMCP
                                             ↓
                                         primitives
                                   (listQuills, getSpecs, createDocument)
                                             ↓
                                       DeliveryStrategy → artifact
```

Three primitives, three tools, 1:1. The `DeliveryStrategy` is the extension point — the default `RenderAndHostStrategy` writes PDFs to disk and returns a URL.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `QUILLMARK_QUILLS_DIR` | `./quills` | Quill templates directory |
| `QUILLMARK_OUTPUT_DIR` | `.artifacts` | Rendered artifact output |
| `QUILLMARK_BIND` | `localhost:8080` | HTTP bind address |
| `QUILLMARK_ENDPOINT` | `/mcp` | MCP HTTP endpoint path |
| `QUILLMARK_BASE_URL` | (auto) | Public artifact base URL |
| `QUILLMARK_STDIO` | `0` | Set to `1` for stdio transport |

## Library use

```js
import { createDefaultMCP } from 'quillmark-mcp';
import { RenderAndHostStrategy } from 'quillmark-mcp/strategies';

const mcp = await createDefaultMCP({
  quillsDir: './quills',
  strategy: new RenderAndHostStrategy({ outputDir: '.artifacts' }),
});
await mcp.start({ transportType: 'stdio' });
```

Primitives are also exported from `quillmark-mcp/primitives` for non-MCP use.

## Development

```sh
npm install
npm test                                # unit + integration
DOCKER_TEST=1 npm run test:docker       # Docker black-box (opt-in)
```

Node ≥ 24.

## License

ISC — see [LICENSE](LICENSE).

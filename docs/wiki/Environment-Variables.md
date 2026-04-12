# Environment Variables

Complete reference for all `QUILLMARK_*` environment variables and related configuration.

---

## Variable Reference

| Variable | CLI Flag | Default | Description |
|----------|----------|---------|-------------|
| `QUILLMARK_QUILLS_DIR` | `--quills-dir` | `./quills` | Path to the quill template directory. Relative paths resolve against `cwd`. |
| `QUILLMARK_OUTPUT_DIR` | `--output-dir` | `.artifacts` | Directory where rendered artifacts are written. |
| `QUILLMARK_BIND` | `--bind` | `localhost:8080` | `host:port` the HTTP server listens on. Ignored in stdio mode. |
| `QUILLMARK_ENDPOINT` | `--endpoint` | `/mcp` | HTTP path where the MCP endpoint is mounted. Ignored in stdio mode. |
| `QUILLMARK_BASE_URL` | `--base-url` | `http://{host}:{port}/artifacts` | Public base URL prepended to artifact paths returned to clients. When empty, derived from the bind address. |
| `QUILLMARK_STDIO` | `--stdio` | _(unset)_ | Set to `1` to force stdio transport. Equivalent to passing `--stdio`. |
| `QUILLMARK_LOCAL_MODEL_MODE` | _(none)_ | _(unset)_ | Set to `1` to enable local model mode. No CLI flag equivalent. |
| `LOG_LEVEL` | _(none)_ | _(unset)_ | Log verbosity level (e.g., `info`, `debug`, `warn`, `error`). Used by the `loglevel` library. |

---

## Precedence Rules

Values are resolved by the `pick()` function in `src/bin.js`:

```
CLI flag  >  environment variable  >  fallback default
```

1. **CLI flag** -- if the flag is passed (value is not `undefined`), it always wins.
2. **Environment variable** -- if set and non-empty (`!== ''`), it takes effect.
3. **Fallback** -- hardcoded default in the source code.

Example resolution chain for the output directory:

```bash
# All three sources available:
QUILLMARK_OUTPUT_DIR=/env/artifacts quillmark-mcp --output-dir /cli/artifacts
# Result: /cli/artifacts  (CLI wins)

# Only env var:
QUILLMARK_OUTPUT_DIR=/env/artifacts quillmark-mcp
# Result: /env/artifacts  (env wins)

# Neither:
quillmark-mcp
# Result: .artifacts  (fallback)
```

### Special cases

Two options bypass the standard `pick()` chain:

| Variable | Behavior |
|----------|----------|
| `QUILLMARK_STDIO` | Boolean OR with `--stdio` flag. Either `--stdio` on the command line **or** `QUILLMARK_STDIO=1` in the environment triggers stdio mode. |
| `QUILLMARK_LOCAL_MODEL_MODE` | Env-only toggle. Set to `1` to activate. There is no CLI flag. |

---

## Docker Compose Environment

The `docker-compose.yml` sets these variables for the containerized server:

```yaml
environment:
  LOG_LEVEL: info
  QUILLMARK_BIND: 0.0.0.0:8080
  QUILLMARK_OUTPUT_DIR: /data/artifacts
  QUILLMARK_QUILLS_DIR: /app/quills
  QUILLMARK_ENDPOINT: /mcp
  QUILLMARK_BASE_URL: http://127.0.0.1:8080/artifacts
```

Key differences from bare-metal defaults:

| Variable | Bare-metal default | Docker Compose value | Why |
|----------|-------------------|---------------------|-----|
| `QUILLMARK_BIND` | `localhost:8080` | `0.0.0.0:8080` | Container must bind all interfaces so the port mapping (`127.0.0.1:8080:8080`) works. |
| `QUILLMARK_OUTPUT_DIR` | `.artifacts` | `/data/artifacts` | Mapped to a named Docker volume (`quillmark-artifacts`). |
| `QUILLMARK_QUILLS_DIR` | `./quills` | `/app/quills` | Quills are baked into the image at `/app/quills` during build. |
| `QUILLMARK_BASE_URL` | _(derived from bind)_ | `http://127.0.0.1:8080/artifacts` | The container binds `0.0.0.0` but `0.0.0.0` is not routable from clients. Artifact URLs must use `127.0.0.1` so the host browser can reach them. |
| `LOG_LEVEL` | _(unset)_ | `info` | Explicit log level for production containers. |

---

## stdio vs HTTP Mode

Not all variables are meaningful in both transport modes.

| Variable | stdio | HTTP | Notes |
|----------|:-----:|:----:|-------|
| `QUILLMARK_QUILLS_DIR` | Yes | Yes | Always needed -- the server loads quill templates regardless of transport. |
| `QUILLMARK_OUTPUT_DIR` | Yes | Yes | Artifacts are rendered in both modes. |
| `QUILLMARK_BASE_URL` | Yes | Yes | In stdio mode, typically set to `file://` so artifact paths are local file URIs. In HTTP mode, usually an `http://` URL. |
| `QUILLMARK_BIND` | -- | Yes | Ignored in stdio mode (no HTTP listener). |
| `QUILLMARK_ENDPOINT` | -- | Yes | Ignored in stdio mode (no HTTP routes). |
| `QUILLMARK_STDIO` | Yes | -- | Setting this to `1` forces stdio mode; the HTTP-only vars become irrelevant. |
| `QUILLMARK_LOCAL_MODEL_MODE` | Yes | Yes | Affects server behavior regardless of transport. |
| `LOG_LEVEL` | Yes | Yes | Controls log verbosity in both modes. |

---

## stdio Docker Containers

When a client spawns a Docker container in stdio mode (via `config` output), these environment variables are injected into the container:

```bash
-e QUILLMARK_OUTPUT_DIR=$HOME/.quillmark/artifacts
-e QUILLMARK_BASE_URL=file://
-e QUILLMARK_STDIO=1
```

The `--stdio` flag is also passed as a CLI argument to the entrypoint. Both the flag and the env var are set for defense in depth.

---

## Examples

```bash
# Override quills directory and output directory via env
export QUILLMARK_QUILLS_DIR=/opt/quills
export QUILLMARK_OUTPUT_DIR=/var/data/artifacts
quillmark-mcp

# Force stdio mode via env (equivalent to --stdio)
QUILLMARK_STDIO=1 quillmark-mcp

# Enable local model mode
QUILLMARK_LOCAL_MODEL_MODE=1 quillmark-mcp --stdio

# Set log level to debug
LOG_LEVEL=debug quillmark-mcp

# Docker Compose with env overrides
QUILLMARK_BASE_URL=https://cdn.example.com/artifacts docker compose up -d

# Verify effective configuration by checking the banner output
quillmark-mcp --bind 0.0.0.0:9090 --endpoint /v1/mcp 2>&1 | head -4
# Transport: streamable HTTP
# URL: http://0.0.0.0:9090/v1/mcp
# Get a client snippet: quillmark-mcp config <client> --url http://0.0.0.0:9090/v1/mcp
# Supported clients: claude-code, claude-desktop, ...
```

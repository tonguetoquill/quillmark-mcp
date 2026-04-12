# Docker and Deployment

Complete reference for building, running, and managing the quillmark-mcp Docker stack. Covers the multi-stage Dockerfile, security hardening, Compose configuration, healthchecks, and the install/uninstall shell scripts.

## Dockerfile: 3-Stage Build

The `Dockerfile` uses [BuildKit](https://docs.docker.com/build/buildkit/) (`# syntax=docker/dockerfile:1.7`) with three named stages. The base image is `node:<version>-slim` (glibc-based; not Alpine, because some SDK transitive deps need glibc).

### Stage 1: `deps` (production dependencies)

```dockerfile
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts
```

Installs only production dependencies. The `--mount=type=cache` directive caches the npm store across rebuilds. `--omit=dev` keeps test/lint tooling out of the final image. `--ignore-scripts` prevents lifecycle scripts from running during install.

### Stage 2: `test` (hermetic test runner)

```dockerfile
FROM node:${NODE_VERSION}-slim AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY src/ ./src/
COPY test/ ./test/
COPY quills/ ./quills/
RUN node --test test/
```

Installs all dependencies (including devDependencies) and runs the full host test suite inside the build. If tests fail, the build fails -- no broken image can be produced. This stage is not carried forward to the final image.

### Stage 3: `runtime` (minimal production image)

```dockerfile
FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r quill \
 && useradd -r -g quill -u 10001 -d /app -s /usr/sbin/nologin quill \
 && mkdir -p /app /data/artifacts \
 && chown -R quill:quill /app /data
```

Installs `tini` as PID 1 child supervisor, creates the non-root `quill` user (UID 10001), and sets up the working directories. Only production `node_modules` from the `deps` stage are copied in:

```dockerfile
COPY --from=deps --chown=quill:quill /app/node_modules ./node_modules
COPY --chown=quill:quill package.json ./
COPY --chown=quill:quill src/ ./src/
COPY --chown=quill:quill quills/ ./quills/
COPY --chown=quill:quill docker/healthcheck.js ./docker/healthcheck.js

USER quill:quill
ENTRYPOINT ["/usr/bin/tini", "--", "node", "src/bin.js"]
```

Environment defaults set in the runtime stage:

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Node.js runtime mode |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `QUILLMARK_BIND` | `0.0.0.0:8080` | Listen address |
| `QUILLMARK_OUTPUT_DIR` | `/data/artifacts` | Rendered PDF output path |
| `QUILLMARK_QUILLS_DIR` | `/app/quills` | Bundled quill definitions |
| `QUILLMARK_ENDPOINT` | `/mcp` | MCP HTTP endpoint path |

The image exposes port `8080` and declares a volume at `/data/artifacts`.

## Security Hardening

All hardening is enforced by both `docker-compose.yml` and the Docker test harness (Layer 4 validates every invariant).

| Measure | Configuration | Purpose |
|---|---|---|
| Non-root user | `user: "10001:10001"` (UID/GID) | Never run as root; `quill` user created in Dockerfile |
| Read-only filesystem | `read_only: true` | Container rootfs is immutable; prevents write-based exploits |
| tmpfs /tmp | `tmpfs: ["/tmp"]` | Writable scratch space without persisting to the image layer |
| Drop all capabilities | `cap_drop: [ALL]` | No Linux kernel capabilities granted to the container |
| No new privileges | `security_opt: [no-new-privileges:true]` | Prevents privilege escalation via setuid/setgid binaries |
| PID limit | `pids_limit: 256` | Prevents fork-bomb resource exhaustion |
| Memory limit | `mem_limit: 512m` | Hard memory cap |
| CPU limit | `cpus: 1.0` | Single CPU core |
| Localhost-only binding | `127.0.0.1:8080:8080` | Port is not exposed beyond the host loopback interface |
| tini as PID 1 | `ENTRYPOINT ["/usr/bin/tini", "--", ...]` | Proper signal forwarding and zombie reaping |
| No shell login | `useradd -s /usr/sbin/nologin quill` | `quill` user cannot start interactive shells |

## docker-compose.yml

One-command bring-up:

```sh
./scripts/install-mcp.sh     # or: docker compose up -d
./scripts/uninstall-mcp.sh   # or: docker compose down
```

### Service configuration

```yaml
services:
  quillmark-mcp:
    build:
      context: .
      dockerfile: Dockerfile
    image: quillmark-mcp:dev
    container_name: quillmark-mcp
    user: "10001:10001"
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 256
    mem_limit: 512m
    cpus: 1.0
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - quillmark-artifacts:/data/artifacts
    environment:
      LOG_LEVEL: info
      QUILLMARK_BIND: 0.0.0.0:8080
      QUILLMARK_OUTPUT_DIR: /data/artifacts
      QUILLMARK_QUILLS_DIR: /app/quills
      QUILLMARK_ENDPOINT: /mcp
      QUILLMARK_BASE_URL: http://127.0.0.1:8080/artifacts
    restart: unless-stopped

volumes:
  quillmark-artifacts:
```

Key points:

- **Ports**: bound to `127.0.0.1` only, per MCP spec guidance. Nothing is exposed beyond the host loopback.
- **Volumes**: `quillmark-artifacts` is a named Docker volume mounted at `/data/artifacts`. PDFs persist across container restarts.
- **QUILLMARK_BASE_URL**: artifact URLs returned to MCP clients use this base. Set to `127.0.0.1` (not `0.0.0.0`) because `0.0.0.0` is not routable from clients.
- **Resource limits**: 512 MB memory, 1 CPU, 256 PIDs.
- **restart: unless-stopped**: auto-restarts on crash but respects manual `docker compose down`.

### Port override

When `install-mcp.sh` is run with `--port <N>` (where N != 8080), it generates a `docker-compose.override.yml`:

```yaml
services:
  quillmark-mcp:
    ports:
      - "127.0.0.1:<N>:8080"
    environment:
      QUILLMARK_BASE_URL: http://127.0.0.1:<N>/artifacts
```

## Healthcheck

**File**: `docker/healthcheck.js`

The Dockerfile declares:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node /app/docker/healthcheck.js || exit 1
```

### How it works

1. Reads `QUILLMARK_BIND` and `QUILLMARK_ENDPOINT` from the environment (defaults: `127.0.0.1:8080`, `/mcp`).
2. Remaps host `0.0.0.0` to `127.0.0.1` (the wildcard is not connectable from inside the container).
3. Sends an HTTP `GET` to the MCP endpoint with a hard-coded 2-second timeout.
4. **Exit 0 (healthy)**: any HTTP status < 500. The MCP endpoint only accepts POST, so GET returns 404 -- that is fine; it proves the process is up and the listener is accepting connections.
5. **Exit 1 (unhealthy)**: status >= 500, connection refused, or timeout.

No `curl` is used -- the slim base image does not ship it. The probe is a pure Node.js script.

## install-mcp.sh

**File**: `scripts/install-mcp.sh`

One-command install for quillmark-mcp. Brings the server up and prints config snippets for all supported MCP clients.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--mode http\|stdio` | `http` | Transport mode. HTTP uses docker compose; stdio spawns per-session containers |
| `--port <N>` | `8080` (or `$QUILLMARK_HOST_PORT`) | Host port for HTTP mode |
| `--target <client>` | `all` | Print snippets for one client only, or `all` for every supported client |
| `--name <name>` | `quillmark` | MCP server registration name |
| `--no-server` | (off) | Skip server bring-up; only print config snippets |
| `-h, --help` | | Print usage |

### Supported clients

`claude-code`, `claude-desktop`, `cursor`, `vscode`, `cline`, `continue`, `codex`, `chatgpt`, `openai-responses`, `openai-agents`, `ollama-mcphost`, `ollama-mcpo`

### Flow

```
Pre-flight
  docker CLI present?
  docker daemon reachable?
  node present?

Image
  quillmark-mcp:dev built? (build if not)

Artifacts
  mkdir -p ~/.quillmark/artifacts

Start server (HTTP mode only)
  docker compose version check
  Generate docker-compose.override.yml if --port != 8080
  docker compose up -d
  Poll container status for up to 30s (healthy or running)

Client snippets
  For each client (or --target):
    node src/bin.js config <client> --mode <mode> [--name, --url, --artifacts-dir, --image]

Done
  Print verify/stop commands
```

In stdio mode, no long-lived server is started. Each client session spawns its own container via `docker run -i --rm`.

Per-client mode selection: `claude-desktop` and `ollama-mcpo` always use `stdio` regardless of the `--mode` flag; all others respect the flag.

## install-ollama.sh

**File**: `scripts/install-ollama.sh`

Fully-automated Ollama + MCPHost + Quillmark local-model setup. Runs a **dedicated** Quillmark sidecar container (`quillmark-mcp-ollama`) on port 8765 with `QUILLMARK_LOCAL_MODEL_MODE=1`, which exposes a 4th tool (`compose_document`) optimized for local models. The default Claude Code endpoint on port 8080 is never touched.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--yes, -y` | (off) | Non-interactive mode; skip all confirmation prompts |
| `--model <name>` | (auto-detected) | Force a specific Ollama model |
| `--port <N>` | `8765` | Sidecar container host port |
| `--stop` | (off) | Tear down the sidecar container and exit |
| `--no-launch` | (off) | Set up everything but do not launch mcphost interactively |
| `--no-server` | (off) | Assume the sidecar is already running |
| `--max-steps <N>` | `30` | MCPHost max reasoning steps |
| `--config <path>` | `~/.mcphost.json` | MCPHost config file path |
| `-h, --help` | | Print usage |

### Flow

```
1. Ollama check
   ollama CLI installed?
   ollama daemon reachable? (ollama list)

2. MCPHost install
   mcphost on PATH? If not, install via:
     Homebrew -> prebuilt binary -> go install (in preference order)

3. Model selection
   Scan ollama list for tool-calling-capable models:
     qwen3, qwen2.5, llama3.x, mistral-nemo, mistral-small,
     hermes3, granite3.x, command-r, phi4, firefunction-v2
   If none found: pull qwen2.5:7b (~4.7 GB)
   If --model specified: use that, pull if needed

4. Quillmark sidecar launch
   Build quillmark-mcp:dev if missing
   docker run -d with:
     QUILLMARK_LOCAL_MODEL_MODE=1
     port 127.0.0.1:<port>:8080
     same security hardening as compose (read-only, cap-drop, etc.)
   Poll for MCP endpoint readiness (30s deadline)

5. Write ~/.mcphost.json
   Backup existing config with timestamp
   node src/bin.js mcphost-config --url <sidecar-url> > ~/.mcphost.json

6. Launch mcphost
   mcphost -m ollama:<model> --config ~/.mcphost.json --max-steps <N>
   Writes a focused system prompt (compose_document preference, retry guidance)
   If --no-launch: print the command and exit
```

### Architecture note

Two containers, two ports, two tool surfaces:

| Container | Port | Tools | Audience |
|---|---|---|---|
| `quillmark-mcp` | 8080 | 3 (`list_quills`, `get_specs`, `create_document`) | Claude Code + hosted models |
| `quillmark-mcp-ollama` | 8765 | 4 (above + `compose_document`) | Local models via MCPHost |

## uninstall-mcp.sh

**File**: `scripts/uninstall-mcp.sh`

One-command teardown. Does **not** modify any MCP client config files (since `install-mcp.sh` only printed snippets, never wrote to client configs).

### Flags

| Flag | Default | Description |
|---|---|---|
| `--purge` | (off) | Also prompt to remove the named volume, host artifacts dir, and Docker image |
| `--yes, -y` | (off) | Non-interactive mode; skip confirmation prompts |
| `-h, --help` | | Print usage |

### Flow

```
1. Compose down
   docker compose down (if any running services)

2. Remove override
   Delete docker-compose.override.yml if present

3. Purge (only with --purge)
   Prompt: remove quillmark-artifacts volume?
   Prompt: remove ~/.quillmark/artifacts/ on the host?
   Prompt: remove quillmark-mcp:dev image?
```

### Cleanup guidance

After uninstall, manually remove the MCP entry from your client config:

```sh
# Claude Code
claude mcp remove quillmark

# Other clients: edit the config file and delete the quillmark block
```

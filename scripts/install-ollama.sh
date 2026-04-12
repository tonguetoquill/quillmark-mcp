#!/usr/bin/env bash
# Fully-automated Ollama + MCPHost + Quillmark setup.
#
# Isolation: this flow runs a DEDICATED Quillmark container named
# `quillmark-mcp-ollama` on port 8765 with QUILLMARK_LOCAL_MODEL_MODE=1 set,
# which exposes an extra `compose_document` tool optimized for local models
# that struggle with raw YAML. The default Claude-Code endpoint on port 8080
# is NEVER touched — run install-mcp.sh for that. This way Claude Code sees
# the same 3 tools it always did, while Ollama-via-MCPHost gets 4 tools
# including the structured convenience wrapper.
#
# What this script does, in order:
#   1. Verifies `ollama` is installed and its daemon is reachable.
#   2. Verifies `mcphost` is installed; installs it if not
#      (Homebrew → prebuilt binary → `go install`, in that order).
#   3. Picks a tool-calling-capable model you already have pulled
#      (qwen3/qwen2.5/llama3.x/mistral-nemo/hermes3/granite3/command-r/phi4),
#      or pulls qwen2.5:7b if none are present.
#   4. Brings up the Ollama-dedicated Quillmark sidecar container on port 8765
#      with QUILLMARK_LOCAL_MODEL_MODE=1 (exposes compose_document).
#   5. Writes ~/.mcphost.json using the server-side generator so the config
#      format stays in sync with the rest of the project.
#   6. Launches `mcphost` in interactive mode with a focused system prompt and
#      --max-steps raised high enough for multi-step tool chains
#      (or prints the command with --no-launch).
#
# Usage:
#   ./scripts/install-ollama.sh                              # full auto
#   ./scripts/install-ollama.sh --yes                        # non-interactive
#   ./scripts/install-ollama.sh --model qwen2.5:14b          # force a specific model
#   ./scripts/install-ollama.sh --port 9765                  # custom sidecar port
#   ./scripts/install-ollama.sh --no-launch                  # set up but don't run
#   ./scripts/install-ollama.sh --no-server                  # assume sidecar is already up
#   ./scripts/install-ollama.sh --stop                       # tear down the sidecar
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

YES=0
LAUNCH=1
SKIP_SERVER_BRINGUP=0
STOP_ONLY=0
FORCE_MODEL=""
SIDECAR_PORT="8765"
SIDECAR_NAME="quillmark-mcp-ollama"
IMAGE="quillmark-mcp:dev"
MCPHOST_CONFIG="$HOME/.mcphost.json"
MCPHOST_REPO="mark3labs/mcphost"
DEFAULT_PULL_MODEL="qwen2.5:7b"
MAX_STEPS="30"

usage() {
  sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)         YES=1; shift ;;
    --no-launch)      LAUNCH=0; shift ;;
    --no-server)      SKIP_SERVER_BRINGUP=1; shift ;;
    --stop)           STOP_ONLY=1; shift ;;
    --model)          FORCE_MODEL="$2"; shift 2 ;;
    --model=*)        FORCE_MODEL="${1#*=}"; shift ;;
    --port)           SIDECAR_PORT="$2"; shift 2 ;;
    --port=*)         SIDECAR_PORT="${1#*=}"; shift ;;
    --max-steps)      MAX_STEPS="$2"; shift 2 ;;
    --max-steps=*)    MAX_STEPS="${1#*=}"; shift ;;
    --config)         MCPHOST_CONFIG="$2"; shift 2 ;;
    --config=*)       MCPHOST_CONFIG="${1#*=}"; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)                echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

QUILL_URL="http://127.0.0.1:${SIDECAR_PORT}/mcp"

if [ -t 1 ]; then
  C_BLUE=$'\033[1;34m'; C_GREEN=$'\033[1;32m'; C_RED=$'\033[1;31m'; C_YELLOW=$'\033[1;33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_DIM=''; C_OFF=''
fi
banner() { printf '\n%s━━━ %s ━━━%s\n' "$C_BLUE" "$*" "$C_OFF"; }
ok()     { printf '%s✓ %s%s\n' "$C_GREEN" "$*" "$C_OFF"; }
warn()   { printf '%s! %s%s\n' "$C_YELLOW" "$*" "$C_OFF"; }
fail()   { printf '\n%s✗ %s%s\n' "$C_RED" "$*" "$C_OFF"; exit 1; }
have()   { command -v "$1" >/dev/null 2>&1; }

confirm() {
  [ "$YES" -eq 1 ] && return 0
  local prompt="${1:-Proceed?} [y/N] "
  read -r -p "$prompt" reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

sidecar_running() {
  docker inspect -f '{{.State.Running}}' "$SIDECAR_NAME" 2>/dev/null | grep -qx true
}

# Short-circuit: --stop tears down the sidecar and exits.
if [ "$STOP_ONLY" -eq 1 ]; then
  banner "Stop sidecar"
  if sidecar_running; then
    docker rm -f "$SIDECAR_NAME" >/dev/null && ok "removed $SIDECAR_NAME"
  else
    ok "no sidecar container running (nothing to stop)"
  fi
  exit 0
fi

# =============================================================================
# 1. Ollama
# =============================================================================
banner "Ollama"
if ! have ollama; then
  warn "ollama CLI not found on PATH."
  cat <<'EOF'

  Install Ollama first, then re-run this script:

    macOS:       brew install ollama
    Linux:       curl -fsSL https://ollama.ai/install.sh | sh
    Windows:     https://ollama.ai/download (GUI installer)

  After install, start the daemon with:
    ollama serve   # in a separate terminal

EOF
  exit 1
fi

if ! ollama list >/dev/null 2>&1; then
  warn "ollama daemon not reachable"
  echo "    Run 'ollama serve' in another terminal, then re-run this script." >&2
  exit 1
fi
ok "ollama installed and reachable ($(ollama --version 2>&1 | head -1 | sed 's/^/    /'))"

# =============================================================================
# 2. MCPHost
# =============================================================================
banner "MCPHost"

install_mcphost_brew() {
  have brew || return 1
  [[ "$(uname)" == "Darwin" || "$(uname)" == "Linux" ]] || return 1
  warn "installing mcphost via Homebrew..."
  brew install mcphost
}

install_mcphost_binary() {
  local os arch archive url tmpdir target_dir
  case "$(uname)" in
    Darwin) os="Darwin" ;;
    Linux)  os="Linux" ;;
    *)      return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)   arch="x86_64" ;;
    arm64|aarch64)  arch="arm64" ;;
    *)              return 1 ;;
  esac
  archive="mcphost_${os}_${arch}.tar.gz"
  url="https://github.com/${MCPHOST_REPO}/releases/latest/download/${archive}"

  warn "downloading $archive from GitHub releases..."
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  if have gh; then
    gh release download --repo "$MCPHOST_REPO" --pattern "$archive" --dir "$tmpdir" \
      || { warn "gh release download failed, falling back to curl"; curl -fsSL -o "$tmpdir/$archive" "$url"; }
  elif have curl; then
    curl -fsSL -o "$tmpdir/$archive" "$url"
  elif have wget; then
    wget -q -O "$tmpdir/$archive" "$url"
  else
    warn "no curl/wget/gh available — cannot download"
    return 1
  fi

  tar -xzf "$tmpdir/$archive" -C "$tmpdir"
  [ -f "$tmpdir/mcphost" ] || { warn "archive did not contain mcphost binary"; return 1; }

  target_dir="$HOME/.local/bin"
  mkdir -p "$target_dir"
  mv "$tmpdir/mcphost" "$target_dir/mcphost"
  chmod +x "$target_dir/mcphost"

  if ! echo ":$PATH:" | grep -q ":$target_dir:"; then
    warn "$target_dir is not on your PATH — add it to your shell rc:"
    warn '    export PATH="$HOME/.local/bin:$PATH"'
    export PATH="$target_dir:$PATH"
  fi
}

install_mcphost_go() {
  have go || return 1
  warn "installing mcphost via 'go install'..."
  go install "github.com/${MCPHOST_REPO}@latest"
  # Ensure GOBIN / GOPATH/bin is on PATH for this session.
  local gobin
  gobin="$(go env GOBIN)"
  [ -z "$gobin" ] && gobin="$(go env GOPATH)/bin"
  if ! echo ":$PATH:" | grep -q ":$gobin:"; then
    warn "$gobin is not on your PATH — add it to your shell rc"
    export PATH="$gobin:$PATH"
  fi
}

if have mcphost; then
  ok "mcphost already installed ($(mcphost --version 2>&1 | head -1))"
else
  warn "mcphost not found — installing"
  if [ "$YES" -eq 0 ] && ! confirm "Install mcphost now?"; then
    fail "aborting — mcphost is required"
  fi

  # Try brew → binary → go, in preference order.
  installed=0
  if install_mcphost_brew;   then installed=1
  elif install_mcphost_binary; then installed=1
  elif install_mcphost_go;     then installed=1
  fi

  # If brew/binary succeeded but mcphost still not on PATH, try rehashing.
  hash -r 2>/dev/null || true

  if [ "$installed" -eq 0 ] || ! have mcphost; then
    fail "mcphost install failed — install manually from https://github.com/${MCPHOST_REPO}"
  fi
  ok "mcphost installed ($(mcphost --version 2>&1 | head -1))"
fi

# =============================================================================
# 3. Model selection
# =============================================================================
banner "Model"

# Known tool-calling-capable Ollama model families, in rough preference order
# (newer + better tool-calling first). Matched as a name prefix.
PREFERRED_MODEL_PREFIXES=(
  "qwen3:"
  "qwen2.5:"
  "llama3.3:"
  "llama3.2:"
  "llama3.1:"
  "mistral-nemo"
  "mistral-small"
  "hermes3:"
  "granite3.3:"
  "granite3.2:"
  "granite3.1:"
  "command-r:"
  "command-r-plus"
  "phi4"
  "firefunction-v2"
)

pick_existing_model() {
  local installed line name prefix
  installed="$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')"
  [ -z "$installed" ] && return 1

  for prefix in "${PREFERRED_MODEL_PREFIXES[@]}"; do
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      case "$name" in
        "$prefix"*) echo "$name"; return 0 ;;
      esac
    done <<< "$installed"
  done
  return 1
}

MODEL=""
if [ -n "$FORCE_MODEL" ]; then
  MODEL="$FORCE_MODEL"
  if ! ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
    warn "model '$MODEL' not pulled yet — pulling now"
    if [ "$YES" -eq 0 ] && ! confirm "Pull $MODEL? (can be GBs)"; then
      fail "aborting — need a pulled model to continue"
    fi
    ollama pull "$MODEL"
  fi
  ok "using forced model: $MODEL"
else
  if MODEL="$(pick_existing_model)"; then
    ok "picked compatible model already on disk: $MODEL"
  else
    warn "no tool-calling-capable Ollama model found locally"
    warn "will pull $DEFAULT_PULL_MODEL (~4.7 GB)"
    if [ "$YES" -eq 0 ] && ! confirm "Pull $DEFAULT_PULL_MODEL now?"; then
      fail "aborting — a compatible model is required"
    fi
    ollama pull "$DEFAULT_PULL_MODEL"
    MODEL="$DEFAULT_PULL_MODEL"
    ok "pulled: $MODEL"
  fi
fi

# =============================================================================
# 4. Quillmark Ollama-dedicated sidecar container
# =============================================================================
banner "Quillmark sidecar (local-model mode)"

server_reachable() {
  # POST with the initialize handshake — a healthy MCP server will respond
  # with 200 OK + JSON-RPC result.
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    -X POST "$QUILL_URL" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"install-ollama","version":"0.0.1"}}}' 2>/dev/null || echo 000)"
  [ "$status" = "200" ]
}

ARTIFACTS_DIR="$HOME/.quillmark/artifacts"
mkdir -p "$ARTIFACTS_DIR"

# Ensure the base image exists (user may have blown it away or never built it).
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  warn "$IMAGE not built — running docker build"
  docker build -t "$IMAGE" . || fail "docker build failed"
fi

if sidecar_running && server_reachable; then
  ok "sidecar $SIDECAR_NAME already running and reachable at $QUILL_URL"
elif [ "$SKIP_SERVER_BRINGUP" -eq 1 ]; then
  fail "$QUILL_URL is not responding and --no-server was passed"
else
  if sidecar_running; then
    warn "sidecar container exists but is not responding — recreating"
    docker rm -f "$SIDECAR_NAME" >/dev/null 2>&1 || true
  fi

  # Remove any stale/stopped container with the same name.
  docker rm -f "$SIDECAR_NAME" >/dev/null 2>&1 || true

  warn "starting sidecar on 127.0.0.1:${SIDECAR_PORT} with QUILLMARK_LOCAL_MODEL_MODE=1"
  docker run -d \
    --name "$SIDECAR_NAME" \
    --label 'quillmark-mcp-role=ollama' \
    --user 10001:10001 \
    --read-only --tmpfs /tmp \
    --cap-drop=ALL \
    --security-opt=no-new-privileges:true \
    --pids-limit=256 \
    -p "127.0.0.1:${SIDECAR_PORT}:8080" \
    -v "${ARTIFACTS_DIR}:${ARTIFACTS_DIR}" \
    -e "QUILLMARK_OUTPUT_DIR=${ARTIFACTS_DIR}" \
    -e "QUILLMARK_BASE_URL=http://127.0.0.1:${SIDECAR_PORT}/artifacts" \
    -e "QUILLMARK_LOCAL_MODEL_MODE=1" \
    "$IMAGE" >/dev/null \
    || fail "docker run failed — check 'docker logs $SIDECAR_NAME'"

  # Poll for the endpoint to become ready.
  deadline=$(( $(date +%s) + 30 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if server_reachable; then break; fi
    sleep 0.5
  done
  if ! server_reachable; then
    docker logs --tail 40 "$SIDECAR_NAME" || true
    fail "sidecar did not become reachable within 30s"
  fi
  ok "sidecar reachable at $QUILL_URL (4 tools incl. compose_document)"
fi

# =============================================================================
# 5. Write ~/.mcphost.json
# =============================================================================
banner "MCPHost config"

if [ -f "$MCPHOST_CONFIG" ]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  cp "$MCPHOST_CONFIG" "${MCPHOST_CONFIG}.bak.${ts}"
  warn "existing $MCPHOST_CONFIG backed up to ${MCPHOST_CONFIG}.bak.${ts}"
fi

# Get the JSON from the server's own generator so schema stays in sync.
if ! node src/bin.js mcphost-config --url "$QUILL_URL" > "$MCPHOST_CONFIG"; then
  fail "failed to generate MCPHost config"
fi
ok "wrote $MCPHOST_CONFIG"
printf '%s' "$C_DIM"; sed 's/^/    /' "$MCPHOST_CONFIG"; printf '%s\n' "$C_OFF"

# =============================================================================
# 6. Launch
# =============================================================================
banner "Launch"

# System prompt tuned for small local models: tells them about the
# structured compose_document tool, forbids emitting the memo as chat text,
# and gives them a concrete 2-step chain to follow.
SYSTEM_PROMPT_FILE="$(mktemp -t quillmark-sysprompt.XXXXXX)"
trap 'rm -f "$SYSTEM_PROMPT_FILE"' EXIT
cat > "$SYSTEM_PROMPT_FILE" <<'SYSPROMPT'
You are a Quillmark rendering assistant. Your job is to produce rendered
documents (PDFs) by calling MCP tools. You must NEVER emit the document body
as chat text — the user wants a file URL, not a rendered-looking chat message.

You have four tools available from the quillmark server:
  - list_quills            : discover available Quill formats
  - get_specs              : read the schema + authoring instructions for a Quill
  - create_document        : render from a raw YAML-frontmatter + markdown string
  - compose_document       : render from structured JSON fields (PREFERRED)

ALWAYS prefer compose_document over create_document. It takes three arguments:
  quill:  the Quill name as a plain string (e.g. "usaf_memo")
  fields: a JSON object of frontmatter fields — plain JSON, no YAML syntax
  body:   the markdown body of the document (no frontmatter delimiters)

The canonical chain for any rendering request is:
  1. Call get_specs with ref=<quill name> to learn the required fields.
  2. Call compose_document with quill, fields, and body.
  3. Return ONLY the URL from the success result — do not paste the document
     back as chat. If the user asks to "open" the file they will do it
     themselves from the URL you return.

If compose_document returns { status: "error", errors: [...] }, read the error
messages, fix the fields, and call compose_document again. You may retry up to
4 times. Do not give up and write the document as chat text — that is a
failure. Ask the user for clarification if needed, but keep calling the tool.
SYSPROMPT

LAUNCH_CMD=(
  mcphost
  -m "ollama:$MODEL"
  --config "$MCPHOST_CONFIG"
  --max-steps "$MAX_STEPS"
  --system-prompt "$SYSTEM_PROMPT_FILE"
)

if [ "$LAUNCH" -eq 0 ]; then
  cat <<EOF

  ${C_GREEN}✓${C_OFF} Ready. Run MCPHost with:

      ${LAUNCH_CMD[*]}

  Sidecar: ${SIDECAR_NAME} on 127.0.0.1:${SIDECAR_PORT}
  Stop:    ./scripts/install-ollama.sh --stop

  Then ask:  "render the usaf_memo example"

EOF
  # Keep the system prompt file so the user can inspect / reuse it.
  trap - EXIT
  echo "  System prompt kept at: $SYSTEM_PROMPT_FILE"
  echo
  exit 0
fi

cat <<EOF

  ${C_GREEN}✓${C_OFF} Launching MCPHost against Quillmark sidecar...
  ${C_DIM}mcphost -m ollama:$MODEL --config $MCPHOST_CONFIG --max-steps $MAX_STEPS --system-prompt <tmpfile>${C_OFF}

  Sidecar:  ${SIDECAR_NAME} on 127.0.0.1:${SIDECAR_PORT}
  Stop:     ./scripts/install-ollama.sh --stop

  Try:      "render the usaf_memo example"
            "render a memo about <your topic>"

  Press Ctrl-C to exit.

EOF

exec "${LAUNCH_CMD[@]}"

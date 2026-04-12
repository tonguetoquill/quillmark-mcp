#!/usr/bin/env bash
# Six-layer local test harness for quillmark-mcp Docker image.
# Usage: ./scripts/docker-test.sh  (or: npm run test:docker)
set -euo pipefail

IMAGE="${QUILLMARK_IMAGE:-quillmark-mcp:dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- output helpers ---
if [ -t 1 ]; then
  C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_RED='\033[1;31m'; C_YELLOW='\033[1;33m'; C_OFF='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_OFF=''
fi
banner() { printf '\n%b━━━ %s ━━━%b\n' "$C_BLUE" "$*" "$C_OFF"; }
ok()     { printf '%b✓ %s%b\n' "$C_GREEN" "$*" "$C_OFF"; }
warn()   { printf '%b! %s%b\n' "$C_YELLOW" "$*" "$C_OFF"; }
fail()   { printf '\n%b✗ %s%b\n' "$C_RED" "$*" "$C_OFF"; exit 1; }
have()   { command -v "$1" >/dev/null 2>&1; }

# --- pre-flight ---
have docker || fail "docker CLI not found"
docker info >/dev/null 2>&1 || fail "docker daemon not reachable"
have node || fail "node not found"

# Keep unit tests hermetic: strip any QUILLMARK_* env vars inherited from the shell
unset QUILLMARK_BIND QUILLMARK_ENDPOINT QUILLMARK_QUILLS_DIR QUILLMARK_OUTPUT_DIR QUILLMARK_BASE_URL QUILLMARK_STDIO || true

# --- cleanup trap ---
cleanup() {
  docker ps -a --filter "label=quillmark-mcp-test=1" -q 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker volume ls -q --filter "label=quillmark-mcp-test=1" 2>/dev/null | xargs -r docker volume rm >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

# =============================================================================
# Layer 1: lint + audit
# =============================================================================
banner "Layer 1: lint + audit"

if have hadolint; then
  hadolint Dockerfile && ok "hadolint passed"
else
  warn "hadolint not installed — skipping Dockerfile lint"
fi

if have shellcheck; then
  shellcheck scripts/docker-test.sh && ok "shellcheck passed"
else
  warn "shellcheck not installed — skipping"
fi

npm audit --audit-level=high >/dev/null 2>&1 && ok "npm audit passed (high+)" \
  || warn "npm audit reported issues; continuing (non-fatal in local dev)"

# =============================================================================
# Layer 2: unit tests (host, hermetic)
# =============================================================================
banner "Layer 2: unit tests (host)"
npm test || fail "unit tests failed"
ok "all unit tests passed"

# =============================================================================
# Layer 3: docker build + size budget
# =============================================================================
banner "Layer 3: docker build"
docker build -t "$IMAGE" . || fail "docker build failed"

SIZE_BYTES="$(docker image inspect "$IMAGE" --format '{{.Size}}')"
SIZE_MB=$(( SIZE_BYTES / 1024 / 1024 ))
BUDGET_MB=450
echo "image size: ${SIZE_MB} MB (budget: ${BUDGET_MB} MB)"
[ "$SIZE_MB" -le "$BUDGET_MB" ] || fail "image exceeds ${BUDGET_MB} MB budget (${SIZE_MB} MB)"
ok "image under size budget"

LAYER_COUNT="$(docker history --no-trunc --format '{{.ID}}' "$IMAGE" | wc -l | tr -d ' ')"
echo "layer count: $LAYER_COUNT"
[ "$LAYER_COUNT" -le 25 ] || warn "layer count high: $LAYER_COUNT"

if have dockle; then
  dockle --exit-code 1 --exit-level warn "$IMAGE" && ok "dockle passed" \
    || warn "dockle reported issues"
else
  warn "dockle not installed — skipping CIS scan"
fi

# =============================================================================
# Layers 4–6: node --test against docker
# =============================================================================
export DOCKER_TEST=1
export QUILLMARK_IMAGE="$IMAGE"

banner "Layer 4: container black-box"
node --test --test-concurrency=1 test/docker/container.test.js || fail "layer 4 failed"
ok "container black-box passed"

banner "Layer 5: MCP protocol compliance"
node --test --test-concurrency=1 test/docker/mcp-protocol.test.js || fail "layer 5 failed"
ok "MCP protocol compliance passed"

banner "Layer 6: PDF fidelity"
node --test --test-concurrency=1 test/docker/pdf-validation.test.js || fail "layer 6 failed"
ok "PDF fidelity passed"

# =============================================================================
# Layer 6b: security scans (best-effort)
# =============================================================================
banner "Layer 6b: security scans (best-effort)"
if have trivy; then
  trivy image --quiet --exit-code 1 --severity CRITICAL "$IMAGE" && ok "trivy clean (CRITICAL)" \
    || fail "trivy found CRITICAL vulnerabilities"
else
  warn "trivy not installed — skipping"
fi
if docker scout --help >/dev/null 2>&1; then
  set +e
  scout_out="$(docker scout cves --exit-code --only-severity critical "$IMAGE" 2>&1)"
  scout_rc=$?
  set -e
  if [ $scout_rc -eq 0 ]; then
    ok "docker scout clean (critical)"
  elif echo "$scout_out" | grep -qi 'Log in with your Docker ID'; then
    warn "docker scout requires 'docker login' — skipping"
  else
    warn "docker scout reported critical issues"
    echo "$scout_out" | tail -20
  fi
else
  warn "docker scout not installed — skipping"
fi

banner "ALL LAYERS PASSED"

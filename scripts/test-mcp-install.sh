#!/usr/bin/env bash
# Round-trip test: install on a non-default port, run the install.test.js
# assertion suite, uninstall, confirm no residue. Never touches a running
# production-port stack on :8080.
#
# Usage:  ./scripts/test-mcp-install.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TEST_PORT=18080

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

# Trap ensures uninstall runs even if assertions fail mid-flight.
cleanup() {
  if [ -f docker-compose.override.yml ] || docker compose ps --quiet 2>/dev/null | grep -q .; then
    banner "Cleanup (trap)"
    ./scripts/uninstall-mcp.sh --yes --keep-registration || true
  fi
}
trap cleanup EXIT INT TERM

# =============================================================================
# Pre-flight
# =============================================================================
banner "Layer 1: pre-flight"
have docker || fail "docker not found"
docker info >/dev/null 2>&1 || fail "docker daemon unreachable"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin missing"
have node || fail "node not found"
ok "tools present"

# Guard against collision with an already-running stack
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  fail "docker compose already has services running — run ./scripts/uninstall-mcp.sh first"
fi

# =============================================================================
# Install on test port
# =============================================================================
banner "Layer 2: install (--port ${TEST_PORT})"
./scripts/install-mcp.sh --port "${TEST_PORT}" --no-claude || fail "install-mcp.sh exited non-zero"
ok "install script exited 0"

# =============================================================================
# Stack health
# =============================================================================
banner "Layer 3: stack health"
ps_out="$(docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null || true)"
echo "$ps_out"
echo "$ps_out" | grep -q quillmark-mcp || fail "quillmark-mcp not in docker compose ps output"
ok "quillmark-mcp is up"

# =============================================================================
# Run the install.test.js suite against the live server
# =============================================================================
banner "Layer 4: assertion suite"
DOCKER_INSTALL_TEST=1 QUILLMARK_INSTALL_PORT="${TEST_PORT}" \
  node --test --test-concurrency=1 test/docker/install.test.js \
  || fail "install.test.js assertions failed"
ok "all install assertions passed"

# =============================================================================
# Uninstall
# =============================================================================
banner "Layer 5: uninstall"
./scripts/uninstall-mcp.sh --yes --keep-registration || fail "uninstall-mcp.sh exited non-zero"
ok "uninstall script exited 0"

# =============================================================================
# Residue check
# =============================================================================
banner "Layer 6: residue check"
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  fail "containers still running after uninstall"
fi
if [ -f docker-compose.override.yml ]; then
  fail "docker-compose.override.yml still present after uninstall"
fi
ok "no residue"

banner "ALL LAYERS PASSED"

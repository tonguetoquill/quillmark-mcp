#!/usr/bin/env bash
# One-command takedown: deregister from Claude Code and bring down the
# docker compose stack. Optionally purges the image and volume.
#
# Usage:
#   ./scripts/uninstall-mcp.sh                 # stop + remove containers
#   ./scripts/uninstall-mcp.sh --purge         # also prompt to drop volume + image
#   ./scripts/uninstall-mcp.sh --yes --purge   # non-interactive full teardown
#   ./scripts/uninstall-mcp.sh --keep-registration   # don't touch claude mcp
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PURGE=0
YES=0
KEEP_REG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge)              PURGE=1; shift ;;
    --yes|-y)             YES=1; shift ;;
    --keep-registration)  KEEP_REG=1; shift ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

if [ -t 1 ]; then
  C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_OFF='\033[0m'
else
  C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_OFF=''
fi
banner() { printf '\n%b━━━ %s ━━━%b\n' "$C_BLUE" "$*" "$C_OFF"; }
ok()     { printf '%b✓ %s%b\n' "$C_GREEN" "$*" "$C_OFF"; }
warn()   { printf '%b! %s%b\n' "$C_YELLOW" "$*" "$C_OFF"; }
have()   { command -v "$1" >/dev/null 2>&1; }

confirm() {
  [ "$YES" -eq 1 ] && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# =============================================================================
# 1. Deregister from Claude Code
# =============================================================================
if [ "$KEEP_REG" -eq 1 ]; then
  warn "skipping Claude Code deregistration (--keep-registration)"
elif have claude; then
  banner "Deregister from Claude Code"
  claude mcp remove quillmark 2>/dev/null && ok "removed quillmark from Claude Code" \
    || warn "quillmark was not registered (or claude mcp remove failed — non-fatal)"
else
  warn "claude CLI not found — skipping deregistration"
fi

# =============================================================================
# 2. Compose down
# =============================================================================
banner "Stop docker compose stack"
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  docker compose down
  ok "compose stack down"
else
  warn "no running compose services"
fi

# =============================================================================
# 3. Remove generated override file
# =============================================================================
if [ -f docker-compose.override.yml ]; then
  rm -f docker-compose.override.yml
  ok "removed docker-compose.override.yml"
fi

# =============================================================================
# 4. Optional purge: volume + image
# =============================================================================
if [ "$PURGE" -eq 1 ]; then
  banner "Purge volume + image"

  if confirm "Remove quillmark-mcp artifacts volume?"; then
    # Volume name depends on compose project name (defaults to repo dir name).
    docker volume ls --format '{{.Name}}' \
      | grep -E 'quillmark-mcp.*quillmark-artifacts$' \
      | xargs -r docker volume rm \
      && ok "volume removed" \
      || warn "volume not found"
  fi

  if confirm "Remove quillmark-mcp:dev image?"; then
    docker rmi quillmark-mcp:dev 2>/dev/null && ok "image removed" \
      || warn "image not found"
  fi
fi

banner "Done"
printf '\n  quillmark-mcp has been torn down.\n\n  Re-install: ./scripts/install-mcp.sh\n\n'

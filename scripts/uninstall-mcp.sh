#!/usr/bin/env bash
# One-command takedown: bring down the docker compose stack and optionally
# purge the image, named volume, and host artifacts dir.
#
# Note: this script does NOT touch any MCP client config file. Since
# install-mcp.sh never wrote to client configs (it only printed snippets),
# there's nothing to unwrite. Remove the entries from your client's config
# yourself — or run e.g. `claude mcp remove quillmark` for Claude Code.
#
# Usage:
#   ./scripts/uninstall-mcp.sh                 # stop + remove containers
#   ./scripts/uninstall-mcp.sh --purge         # also prompt to drop volume + image
#   ./scripts/uninstall-mcp.sh --yes --purge   # non-interactive full teardown
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PURGE=0
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge)              PURGE=1; shift ;;
    --yes|-y)             YES=1; shift ;;
    -h|--help)
      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
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

confirm() {
  [ "$YES" -eq 1 ] && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# =============================================================================
# 1. Compose down
# =============================================================================
banner "Stop docker compose stack"
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  docker compose down
  ok "compose stack down"
else
  warn "no running compose services"
fi

# =============================================================================
# 2. Remove generated files
# =============================================================================
if [ -f docker-compose.override.yml ]; then
  rm -f docker-compose.override.yml
  ok "removed docker-compose.override.yml"
fi
if [ -f .mcp.json ]; then
  rm -f .mcp.json
  ok "removed .mcp.json"
fi

# =============================================================================
# 3. Always remove image so install-mcp.sh gets a clean rebuild
# =============================================================================
banner "Remove image"
docker rmi quillmark-mcp:dev 2>/dev/null && ok "image removed" \
  || warn "image not found"

# =============================================================================
# 4. Optional purge: volume + artifacts
# =============================================================================
if [ "$PURGE" -eq 1 ]; then
  banner "Purge volume + artifacts"

  if confirm "Remove quillmark-mcp named volume (compose/HTTP mode)?"; then
    docker volume ls --format '{{.Name}}' \
      | grep -E 'quillmark-mcp.*quillmark-artifacts$' \
      | xargs -r docker volume rm \
      && ok "volume removed" \
      || warn "volume not found"
  fi

  ARTIFACTS_DIR="$HOME/.quillmark/artifacts"
  if [ -d "$ARTIFACTS_DIR" ]; then
    if confirm "Remove host artifacts dir ($ARTIFACTS_DIR)?"; then
      rm -rf "$ARTIFACTS_DIR"
      ok "artifacts dir removed"
    fi
  fi
fi

banner "Done"
printf '\n  quillmark-mcp has been torn down.\n\n  Re-install: ./scripts/install-mcp.sh\n\n'

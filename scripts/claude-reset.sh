#!/usr/bin/env bash
# Clear a cached-but-invalid MCP OAuth entry from Claude Code's credentials
# store. Fixes the "needs authentication" prompt that persists across
# `claude mcp remove` + `claude mcp add` cycles after a failed HTTP
# registration (anthropics/claude-code#34008).
#
# Usage:  ./scripts/claude-reset.sh              # clears "quillmark"
#         ./scripts/claude-reset.sh my-server    # clears a different entry
#
# Safe: backs up the credentials file before editing, scoped to a single
# server name, never touches other servers' OAuth state.
set -euo pipefail

SERVER_NAME="${1:-quillmark}"
CREDS="$HOME/.claude/.credentials.json"

if [ ! -f "$CREDS" ]; then
  echo "no credentials file at $CREDS — nothing to reset"
  exit 0
fi

BACKUP="$HOME/.claude/.credentials.json.bak-$(date +%s)"
cp "$CREDS" "$BACKUP"

if command -v jq >/dev/null 2>&1; then
  jq --arg s "$SERVER_NAME" \
     'if .mcpOAuth then .mcpOAuth |= with_entries(select(.key != $s)) else . end' \
     "$CREDS" > "$CREDS.tmp" && mv "$CREDS.tmp" "$CREDS"
else
  node -e '
    const fs = require("fs");
    const [,, p, s] = process.argv;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (j.mcpOAuth) delete j.mcpOAuth[s];
    fs.writeFileSync(p, JSON.stringify(j, null, 2));
  ' "$CREDS" "$SERVER_NAME"
fi

echo "cleared '${SERVER_NAME}' from mcpOAuth (backup: $BACKUP)"

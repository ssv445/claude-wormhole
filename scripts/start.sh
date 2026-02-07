#!/usr/bin/env bash
# Standalone startup script for claude-bridge web server.
# Builds if needed, ensures tailscale serve is active, then starts the server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$SCRIPT_DIR/../web"

cd "$WEB_DIR"

# Build if .next/ doesn't exist
if [ ! -d ".next" ]; then
  echo "No .next/ found — running build..."
  npm run build
fi

# Ensure tailscale serve is active (idempotent, safe to re-run)
if command -v tailscale &>/dev/null; then
  tailscale serve --bg 3100 2>/dev/null || echo "Warning: tailscale serve failed (is Tailscale running?)"
fi

# Start the production server
exec npm start

#!/bin/bash
# env.sh - Shared environment for all wormhole commands
# Source this at the top of every script: source "$(dirname "$0")/env.sh"

# Root directory
WORMHOLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load secrets (.env) if present
[ -f "$WORMHOLE_ROOT/.env" ] && set -a && source "$WORMHOLE_ROOT/.env" && set +a
[ -f "$WORMHOLE_ROOT/.env.local" ] && set -a && source "$WORMHOLE_ROOT/.env.local" && set +a

# Services
# PORT comes from .env.local (loaded above), defaults to 3100
# CLAUDE_WORMHOLE_URL is the user-facing env var (set in shell profile / .env)
# WORMHOLE_URL is the internal name used by all wormhole commands
export WORMHOLE_PORT="${PORT:-${WORMHOLE_PORT:-3100}}"
export WORMHOLE_URL="${CLAUDE_WORMHOLE_URL:-http://localhost:$WORMHOLE_PORT}"

# PATH - ensure claude, node, brew etc. are available (launchd/cron has minimal PATH)
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

# nvm node goes FIRST so it wins over /usr/local/bin system node
NVM_DEFAULT="$HOME/.nvm/versions/node"
if [ -d "$NVM_DEFAULT" ]; then
  NVM_NODE=$(ls -d "$NVM_DEFAULT"/*/bin 2>/dev/null | tail -1)
  [ -n "$NVM_NODE" ] && export PATH="$NVM_NODE:$PATH"
fi

# Allow nested Claude Code sessions
unset CLAUDECODE 2>/dev/null || true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[36m'
DIM='\033[2m'
NC='\033[0m'

log() { echo -e "${BLUE}[wormhole]${NC} $1"; }
ok()  { echo -e "${GREEN}[wormhole]${NC} $1"; }
warn(){ echo -e "${YELLOW}[wormhole]${NC} $1"; }
err() { echo -e "${RED}[wormhole]${NC} $1" >&2; }

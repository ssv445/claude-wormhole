#!/bin/bash
# install.sh - One-shot setup for claude-wormhole
# Makes the `wormhole` command available system-wide on macOS.

set -euo pipefail

WORMHOLE_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[install]${NC} $1"; }
ok()  { echo -e "${GREEN}[install]${NC} $1"; }
warn(){ echo -e "${YELLOW}[install]${NC} $1"; }
err() { echo -e "${RED}[install]${NC} $1" >&2; }

echo ""
echo "  WORMHOLE INSTALLER"
echo "  ──────────────────"
echo ""

# ── 1. Check prerequisites ──

log "Checking prerequisites..."

MISSING=()
command -v tmux &>/dev/null    || MISSING+=("tmux (brew install tmux)")
command -v node &>/dev/null    || MISSING+=("node (brew install node)")
command -v npm  &>/dev/null    || MISSING+=("npm (comes with node)")
command -v jq   &>/dev/null    || MISSING+=("jq (brew install jq)")
command -v claude &>/dev/null  || MISSING+=("claude (npm install -g @anthropic-ai/claude-code)")

if [ ${#MISSING[@]} -gt 0 ]; then
  err "Missing required tools:"
  for m in "${MISSING[@]}"; do
    echo "  - $m"
  done
  exit 1
fi

if ! command -v tailscale &>/dev/null; then
  warn "Tailscale not found - remote access won't work without it"
  warn "Install: brew install --cask tailscale"
fi

ok "All prerequisites met"

# ── 2. Install dependencies + build ──

log "Installing npm dependencies..."
(cd "$WORMHOLE_ROOT" && npm install)

log "Building web app..."
(cd "$WORMHOLE_ROOT" && npm run build)

ok "Build complete"

# ── 3. Symlink wormhole to PATH ──

log "Setting up wormhole CLI..."

chmod +x "$WORMHOLE_ROOT/bin/wormhole"
chmod +x "$WORMHOLE_ROOT/bin/env.sh"

# Try /usr/local/bin first (needs sudo), fall back to ~/.local/bin
LINK_TARGET="/usr/local/bin/wormhole"
FALLBACK_TARGET="$HOME/.local/bin/wormhole"

_do_symlink() {
  local target="$1"
  local use_sudo="${2:-false}"

  if [ -L "$target" ] || [ -e "$target" ]; then
    local existing
    existing=$(readlink "$target" 2>/dev/null || echo "unknown")
    if [ "$existing" = "$WORMHOLE_ROOT/bin/wormhole" ]; then
      ok "Already symlinked: $target"
      return 0
    fi
    warn "Existing wormhole at $target -> $existing"
    read -r -p "Overwrite? [y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
      return 1
    fi
  fi

  if $use_sudo; then
    sudo ln -sf "$WORMHOLE_ROOT/bin/wormhole" "$target" 2>/dev/null
  else
    ln -sf "$WORMHOLE_ROOT/bin/wormhole" "$target"
  fi
}

if _do_symlink "$LINK_TARGET" true 2>/dev/null; then
  ok "Symlinked wormhole -> $LINK_TARGET"
else
  # Fallback to ~/.local/bin (no sudo needed)
  mkdir -p "$HOME/.local/bin"
  if _do_symlink "$FALLBACK_TARGET" false; then
    ok "Symlinked wormhole -> $FALLBACK_TARGET"
    # Ensure ~/.local/bin is in PATH
    if ! echo "$PATH" | tr ':' '\n' | grep -q "$HOME/.local/bin"; then
      warn "Add to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
  else
    warn "Skipping symlink. You can manually add bin/ to your PATH."
  fi
fi

# ── 4. tmux config ──

log "Setting up tmux..."

if [ -f "$HOME/.tmux.conf" ]; then
  if grep -q "tmux-resurrect\|tmux-continuum" "$HOME/.tmux.conf"; then
    ok "tmux.conf already has resurrect/continuum - skipping"
  else
    warn "~/.tmux.conf exists but missing resurrect/continuum"
    echo "  You may want to merge from: $WORMHOLE_ROOT/scripts/tmux.conf"
  fi
else
  cp "$WORMHOLE_ROOT/scripts/tmux.conf" "$HOME/.tmux.conf"
  ok "Copied tmux.conf to ~/.tmux.conf"
  echo "  Run tmux, then press prefix + I to install plugins"
fi

# ── 5. Configure Claude Code hooks ──

log "Configuring Claude Code hooks..."

CLAUDE_SETTINGS="$HOME/.claude/settings.json"
WORMHOLE_BIN="$WORMHOLE_ROOT/bin/wormhole"

if [ -f "$CLAUDE_SETTINGS" ]; then
  # Check if hooks are already configured
  if grep -q "wormhole notify\|wormhole statusline" "$CLAUDE_SETTINGS"; then
    ok "Claude hooks already configured - skipping"
  else
    warn "~/.claude/settings.json exists - hooks need manual setup"
    echo ""
    echo "  Add these hooks to your settings.json:"
    echo ""
    echo "  \"Notification\": [{"
    echo "    \"matcher\": \"*\","
    echo "    \"hooks\": [{ \"type\": \"command\", \"command\": \"$WORMHOLE_BIN notify\", \"timeout\": 10 }]"
    echo "  }],"
    echo "  \"Stop\": [{"
    echo "    \"hooks\": [{ \"type\": \"command\", \"command\": \"$WORMHOLE_BIN notify\", \"timeout\": 10 }]"
    echo "  }]"
    echo ""
  fi
else
  mkdir -p "$HOME/.claude"
  cat > "$CLAUDE_SETTINGS" <<EOF
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$WORMHOLE_BIN notify",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$WORMHOLE_BIN notify",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
EOF
  ok "Created ~/.claude/settings.json with notification hooks"
fi

# ── 6. Tailscale serve ──

if command -v tailscale &>/dev/null; then
  log "Setting up Tailscale serve..."
  tailscale serve --bg --https 3100 3100 2>/dev/null \
    && ok "Tailscale serving port 3100 over HTTPS" \
    || warn "Tailscale serve failed (is Tailscale running?)"
fi

# ── 7. Shell alias for cld ──

log "Setting up shell alias..."

SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"

if grep -q 'alias cld=' "$SHELL_RC" 2>/dev/null; then
  # Update existing alias
  if grep -q "wormhole cld" "$SHELL_RC"; then
    ok "cld alias already points to wormhole - skipping"
  else
    warn "Existing cld alias found in $SHELL_RC"
    echo "  Update it to: alias cld=\"wormhole cld\""
  fi
else
  echo '' >> "$SHELL_RC"
  echo '# claude-wormhole: launch Claude Code in tmux' >> "$SHELL_RC"
  echo 'alias cld="wormhole cld"' >> "$SHELL_RC"
  ok "Added cld alias to $SHELL_RC"
fi

# ── Done ──

echo ""
echo "  ──────────────────────────────────"
echo -e "  ${GREEN}Installation complete!${NC}"
echo "  ──────────────────────────────────"
echo ""
echo "  Quick start:"
echo "    wormhole start        # Start the web server"
echo "    wormhole status       # Check system health"
echo "    cld                   # Launch Claude in tmux"
echo ""
echo "  Remote access:"
echo "    Open https://$(hostname).tailnet.ts.net/ on your phone"
echo ""
echo "  Run 'source $SHELL_RC' or open a new terminal for the cld alias."
echo ""

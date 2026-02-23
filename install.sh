#!/bin/bash
# install.sh - One-shot setup for claude-wormhole
# Makes the `wormhole` command available system-wide on macOS.

set -euo pipefail

WORMHOLE_ROOT="$(cd "$(dirname "$0")" && pwd)"
# Load .env.local for PORT if present
[ -f "$WORMHOLE_ROOT/.env.local" ] && set -a && source "$WORMHOLE_ROOT/.env.local" && set +a
WORMHOLE_PORT="${PORT:-${WORMHOLE_PORT:-3100}}"

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

# ── 2. Clean up old installation artifacts ──

log "Cleaning up old artifacts..."

# Remove old individual scripts that were merged into bin/wormhole
OLD_SCRIPTS=(
  "$WORMHOLE_ROOT/scripts/cld.sh"
  "$WORMHOLE_ROOT/scripts/notify.sh"
  "$WORMHOLE_ROOT/scripts/statusline.sh"
  "$WORMHOLE_ROOT/scripts/start.sh"
  "$WORMHOLE_ROOT/scripts/service.sh"
  "$WORMHOLE_ROOT/scripts/release.sh"
  "$WORMHOLE_ROOT/scripts/setup-push.sh"
  "$WORMHOLE_ROOT/restart.sh"
  "$WORMHOLE_ROOT/monitor.sh"
)
for old in "${OLD_SCRIPTS[@]}"; do
  if [ -f "$old" ]; then
    rm -f "$old"
    ok "Removed old script: ${old##*/}"
  fi
done

# Remove old docs that moved to docs/
for old_doc in "$WORMHOLE_ROOT/SETUP.md" "$WORMHOLE_ROOT/WHY.md"; do
  if [ -f "$old_doc" ]; then
    rm -f "$old_doc"
    ok "Removed old doc: ${old_doc##*/} (now in docs/)"
  fi
done

# Remove stale launchd plist with hardcoded paths
PLIST_DST="$HOME/Library/LaunchAgents/com.claude-wormhole.web.plist"
if [ -f "$PLIST_DST" ]; then
  # Check if plist has hardcoded paths (old format) vs template-generated
  if grep -q '/Users/' "$PLIST_DST" 2>/dev/null; then
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    rm -f "$PLIST_DST"
    ok "Removed old launchd plist with hardcoded paths"
  fi
fi

# Remove stale symlinks pointing to old script locations
for target in /usr/local/bin/wormhole "$HOME/.local/bin/wormhole"; do
  if [ -L "$target" ]; then
    local_dest=$(readlink "$target" 2>/dev/null || true)
    # Remove if pointing to a non-existent file (stale symlink)
    if [ -n "$local_dest" ] && [ ! -e "$local_dest" ]; then
      rm -f "$target" 2>/dev/null || true
      ok "Removed stale symlink: $target -> $local_dest"
    fi
  fi
done

# Clean old Claude hook references in settings.json
CLAUDE_SETTINGS_FILE="$HOME/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS_FILE" ]; then
  if grep -q 'scripts/notify\.sh\|scripts/statusline\.sh' "$CLAUDE_SETTINGS_FILE" 2>/dev/null; then
    warn "~/.claude/settings.json has old script references"
    warn "These will be updated in the hooks setup step"
  fi
fi

ok "Cleanup complete"

# ── 3. Install dependencies + build ──

log "Installing npm dependencies..."
(cd "$WORMHOLE_ROOT" && npm install)

log "Building web app..."
(cd "$WORMHOLE_ROOT" && npm run build)

ok "Build complete"

# ── 4. Symlink wormhole to PATH ──

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

# ── 5. tmux config ──

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

# ── 6. Configure Claude Code hooks ──

log "Configuring Claude Code hooks..."

CLAUDE_SETTINGS="$HOME/.claude/settings.json"
WORMHOLE_BIN="$WORMHOLE_ROOT/bin/wormhole"

if [ -f "$CLAUDE_SETTINGS" ]; then
  # Check if hooks are already configured with current paths
  if grep -q "wormhole notify\|wormhole statusline" "$CLAUDE_SETTINGS"; then
    ok "Claude hooks already configured - skipping"
  elif grep -q 'scripts/notify\.sh\|scripts/statusline\.sh' "$CLAUDE_SETTINGS"; then
    # Upgrade old hook references to new bin/wormhole paths
    log "Upgrading old hook references..."
    sed -i '' \
      -e 's|[^"]*scripts/notify\.sh|'"$WORMHOLE_BIN"' notify|g' \
      -e 's|[^"]*scripts/statusline\.sh|'"$WORMHOLE_BIN"' statusline|g' \
      "$CLAUDE_SETTINGS"
    ok "Updated Claude hooks to use bin/wormhole"
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

# ── 7. Tailscale serve ──

if command -v tailscale &>/dev/null; then
  log "Setting up Tailscale serve..."
  tailscale serve --bg --https "$WORMHOLE_PORT" "$WORMHOLE_PORT" 2>/dev/null \
    && ok "Tailscale serving port $WORMHOLE_PORT over HTTPS" \
    || warn "Tailscale serve failed (is Tailscale running?)"
fi

# ── 8. Shell alias for cld ──

log "Setting up shell alias..."

case "$(basename "${SHELL:-/bin/bash}")" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash) SHELL_RC="$HOME/.bashrc" ;;
  fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
  *)    SHELL_RC="$HOME/.profile" ;;
esac

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
if command -v tailscale &>/dev/null; then
  TS_NAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//')
  if [ -n "$TS_NAME" ]; then
    echo "    Open https://${TS_NAME}/ on your phone"
  else
    echo "    Open your Tailscale HTTPS URL on your phone"
  fi
else
  echo "    Install Tailscale for remote access"
fi
echo ""
echo "  Run 'source $SHELL_RC' or open a new terminal for the cld alias."
echo ""

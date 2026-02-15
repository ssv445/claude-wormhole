#!/usr/bin/env bash
# Manage the claude-wormhole launchd agent.
#
# Usage:
#   ./scripts/service.sh install    # Copy plist + load
#   ./scripts/service.sh uninstall  # Unload + remove plist
#   ./scripts/service.sh start      # Start the agent
#   ./scripts/service.sh stop       # Stop the agent
#   ./scripts/service.sh restart    # Stop + start
#   ./scripts/service.sh status     # Show if running
#   ./scripts/service.sh logs       # Tail the logs

set -euo pipefail

LABEL="com.claude-wormhole.web"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.claude-wormhole.web.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_FILE="/tmp/claude-wormhole.log"
ERR_FILE="/tmp/claude-wormhole.err"

case "${1:-}" in
  install)
    # Build first so launchd doesn't start a server with no .next/
    echo "Building web app..."
    (cd "$SCRIPT_DIR/../web" && npm run build)

    echo "Installing plist..."
    cp "$PLIST_SRC" "$PLIST_DST"

    # Ensure tailscale serve is active
    if command -v tailscale &>/dev/null; then
      tailscale serve --bg --https 3100 3100 2>/dev/null || echo "Warning: tailscale serve failed"
    fi

    echo "Loading agent..."
    launchctl load "$PLIST_DST"
    echo "Installed and started."
    ;;

  uninstall)
    echo "Unloading agent..."
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    rm -f "$PLIST_DST"
    echo "Uninstalled."
    ;;

  start)
    launchctl start "$LABEL"
    echo "Started."
    ;;

  stop)
    launchctl stop "$LABEL"
    echo "Stopped."
    ;;

  restart)
    launchctl stop "$LABEL" 2>/dev/null || true
    sleep 1
    launchctl start "$LABEL"
    echo "Restarted."
    ;;

  status)
    if launchctl list "$LABEL" &>/dev/null; then
      echo "Running:"
      launchctl list "$LABEL"
    else
      echo "Not running (or not loaded)."
    fi
    ;;

  logs)
    echo "=== stdout ($LOG_FILE) ==="
    tail -f "$LOG_FILE" "$ERR_FILE"
    ;;

  *)
    echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs}"
    exit 1
    ;;
esac

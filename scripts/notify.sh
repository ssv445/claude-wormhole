#!/bin/bash
# Claude Code hook script — sends notifications to claude-wormhole server.
# Reads hook event JSON from stdin, POSTs to /api/notify.
# Used by Notification + Stop hooks in ~/.claude/settings.json.

INPUT=$(cat)
NOTIFICATION_TYPE=$(echo "$INPUT" | jq -r '.notification_type // "stop"')
MESSAGE=$(echo "$INPUT" | jq -r '.message // "Claude finished"')
TITLE=$(echo "$INPUT" | jq -r '.title // ""')

# Get tmux session name for context (if running inside tmux)
TMUX_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo "unknown")

# Map notification_type to the type field expected by /api/notify
case "$NOTIFICATION_TYPE" in
  permission_prompt) TYPE="permission" ;;
  idle_prompt)       TYPE="idle" ;;
  stop)              TYPE="stop"; MESSAGE="${TITLE:-Claude finished}" ;;
  *)                 TYPE="$NOTIFICATION_TYPE" ;;
esac

# CLAUDE_WORMHOLE_URL can be set in your shell profile; defaults to localhost:3100
WORMHOLE_URL="${CLAUDE_WORMHOLE_URL:-http://localhost:3100}"

curl -s -X POST "$WORMHOLE_URL/api/notify" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"$TYPE\", \"message\": \"$MESSAGE\", \"session\": \"$TMUX_SESSION\"}" \
  > /dev/null 2>&1

exit 0

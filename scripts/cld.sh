#!/bin/bash
# cld - Launch Claude Code in a tmux session
#
# Usage: cld [claude-args...]
#   cld                    # Auto-detect session from current directory
#   cld --model opus       # Pass extra args to claude
#
# Environment:
#   CLD_ARGS  Default flags passed to claude.
#             Default: "--dangerously-skip-permissions --chrome"

set -e

DEFAULT_ARGS="${CLD_ARGS:---dangerously-skip-permissions --chrome}"

# Already inside tmux? Just run claude.
if [ -n "${TMUX:-}" ]; then
    exec claude $DEFAULT_ARGS "$@"
fi

if ! command -v tmux &> /dev/null; then
    echo "Error: tmux is not installed (brew install tmux)"
    exit 1
fi

PROJECT_NAME=$(basename "$PWD")

# Find sessions whose working directory matches PWD
SESSIONS=$(tmux list-sessions -F "#{session_name}" 2>/dev/null | while read -r s; do
    dir=$(tmux display-message -p -t "$s" '#{pane_current_path}' 2>/dev/null)
    [ "$dir" = "$PWD" ] && echo "$s"
done || true)

if [ -z "$SESSIONS" ]; then
    SESSION_NAME="$PROJECT_NAME"
else
    echo "Sessions for $PROJECT_NAME:"
    echo ""

    i=1
    while IFS= read -r session; do
        DIR=$(tmux display-message -p -t "$session" '#{pane_current_path}' 2>/dev/null | sed "s|$HOME|~|" || echo "")
        echo "  [$i] $session  ${DIR:+($DIR)}"
        ((i++))
    done <<< "$SESSIONS"
    echo "  [n] New session"
    echo ""

    read -rp "Choice: " choice

    if [[ "$choice" == "n" || "$choice" == "N" ]]; then
        COUNT=$(echo "$SESSIONS" | wc -l | tr -d ' ')
        SESSION_NAME="${PROJECT_NAME}-$((COUNT + 1))"
    else
        SESSION_NAME=$(echo "$SESSIONS" | sed -n "${choice}p")
        if [ -z "$SESSION_NAME" ]; then
            echo "Invalid choice"
            exit 1
        fi
    fi
fi

CLAUDE_CMD="claude $DEFAULT_ARGS $*"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Attaching to: $SESSION_NAME"
    tmux attach -t "$SESSION_NAME"
else
    echo "Creating: $SESSION_NAME"
    tmux new-session -s "$SESSION_NAME" -c "$PWD" "$CLAUDE_CMD; exec $SHELL"
fi

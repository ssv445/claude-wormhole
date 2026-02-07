#!/bin/bash
# cld - Launch Claude Code (dangerous mode + chrome) in a tmux session
#
# Prerequisites:
#   - tmux        : brew install tmux
#   - sesh        : brew install joshmedeski/sesh/sesh
#   - claude      : npm install -g @anthropic-ai/claude-code
#
# Usage: cld [session-name] [-- claude-args...]
#   cld                       # Auto-detect session from current directory
#   cld my-session            # Use specific session name
#   cld -- -c                 # Pass extra args to claude
#   cld my-session -- --model opus  # Custom session + claude args
#
# Behavior:
#   - Auto-detects project name from current directory
#   - Lists existing tmux sessions matching the project
#   - Reuses existing session or creates a new one
#   - Always runs claude with --dangerously-skip-permissions --chrome
#   - Falls back to shell when claude exits

set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check tmux is installed
if ! command -v tmux &> /dev/null; then
    echo -e "${RED}Error: tmux is not installed${NC}"
    echo "Install with: brew install tmux"
    exit 1
fi

PROJECT_NAME=$(basename "$PWD")

# Parse arguments to separate session name from claude args
SESSION_NAME=""
CLAUDE_ARGS=""

# Check if -- separator exists
if [[ "$*" == *" -- "* ]]; then
    # Split on --
    BEFORE_SEP="${*%% -- *}"
    AFTER_SEP="${*#* -- }"

    if [ -n "$BEFORE_SEP" ]; then
        SESSION_NAME="$BEFORE_SEP"
    fi
    CLAUDE_ARGS="$AFTER_SEP"
elif [ -n "$1" ]; then
    SESSION_NAME="$1"
fi

# If no session name provided, detect from directory
if [ -z "$SESSION_NAME" ]; then
    # Get existing sessions matching this project (using tmux directly)
    SESSIONS=$(tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^${PROJECT_NAME}" || true)

    if [ -z "$SESSIONS" ]; then
        # No existing sessions - create new
        echo -e "${GREEN}Creating new session: $PROJECT_NAME${NC}"
        SESSION_NAME="$PROJECT_NAME"
    else
        # Show existing sessions
        echo "Existing sessions for $PROJECT_NAME:"
        echo ""

        # Number the sessions
        i=1
        while IFS= read -r session; do
            # Get working directory for this session
            DIR=$(tmux display-message -p -t "$session" '#{pane_current_path}' 2>/dev/null | sed "s|$HOME|~|" || echo "")
            echo "  [$i] $session  ${DIR:+($DIR)}"
            ((i++))
        done <<< "$SESSIONS"
        echo "  [n] Create new session"
        echo ""

        read -p "Choice: " choice

        if [[ "$choice" == "n" || "$choice" == "N" ]]; then
            # Generate new session name with counter
            COUNT=$(echo "$SESSIONS" | wc -l | tr -d ' ')
            SESSION_NAME="${PROJECT_NAME}-$((COUNT + 1))"
            echo -e "${GREEN}Creating new session: $SESSION_NAME${NC}"
        else
            # Select existing session
            SESSION_NAME=$(echo "$SESSIONS" | sed -n "${choice}p")
            if [ -z "$SESSION_NAME" ]; then
                echo -e "${RED}Invalid choice${NC}"
                exit 1
            fi
        fi
    fi
fi

# Build claude command with always-on flags
CLAUDE_CMD="claude --dangerously-skip-permissions --chrome"
if [ -n "$CLAUDE_ARGS" ]; then
    CLAUDE_CMD="$CLAUDE_CMD $CLAUDE_ARGS"
fi

# Connect to session
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}Attaching to: $SESSION_NAME${NC}"
    sesh connect "$SESSION_NAME"
else
    echo -e "${GREEN}Creating session with Claude: $SESSION_NAME${NC}"
    tmux new-session -d -s "$SESSION_NAME" -c "$PWD" "$CLAUDE_CMD; exec $SHELL"
    sesh connect "$SESSION_NAME"
fi

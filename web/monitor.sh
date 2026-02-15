#!/bin/bash
# Watchdog for claude-wormhole web server
# Checks health every 60s, restarts after 3 consecutive failures
#
# Usage:
#   ./monitor.sh              # run in foreground
#   ./monitor.sh &            # run in background
#   tmux new -d -s monitor './monitor.sh'  # run in tmux (recommended)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/claude-wormhole-monitor.log"
HEALTH_URL="http://localhost:3100/api/sessions"
CHECK_INTERVAL=60
FAIL_THRESHOLD=3

fail_count=0

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG"
}

log "Monitor started (check every ${CHECK_INTERVAL}s, restart after ${FAIL_THRESHOLD} failures)"

while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    if [ "$fail_count" -gt 0 ]; then
      log "Recovered (was at $fail_count failures)"
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    log "Health check failed ($fail_count/$FAIL_THRESHOLD) — HTTP $HTTP_CODE"

    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      log "Restarting server..."
      "$SCRIPT_DIR/restart.sh" >> "$LOG" 2>&1
      if [ $? -eq 0 ]; then
        log "Restart succeeded"
      else
        log "Restart FAILED — will retry next cycle"
      fi
      fail_count=0
    fi
  fi

  sleep "$CHECK_INTERVAL"
done

#!/bin/bash
# Rebuild and restart claude-bridge web server
# Usage: ./restart.sh

set -e
cd "$(dirname "$0")"

# Only kill node processes LISTENING on port 3100 (not tailscale, browsers, etc.)
echo "==> Stopping server on port 3100..."
SERVER_PIDS=$(lsof -iTCP:3100 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$SERVER_PIDS" ]; then
  # Graceful TERM first, then KILL after timeout
  echo "$SERVER_PIDS" | xargs kill 2>/dev/null || true
  for i in 1 2 3 4 5; do
    sleep 1
    if ! lsof -iTCP:3100 -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "==> Port 3100 is free"
      break
    fi
    echo "    Still listening, sending KILL (attempt $i)..."
    lsof -iTCP:3100 -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
else
  echo "==> Port 3100 is free"
fi

# Final check — only fail if something is still LISTENING
if lsof -iTCP:3100 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "ERROR: Could not free port 3100. PIDs still holding it:"
  lsof -iTCP:3100 -sTCP:LISTEN
  exit 1
fi

echo "==> Clean building..."
rm -rf .next
npm run build

echo "==> Starting server..."
NODE_ENV=production nohup node dist/server.cjs > /tmp/claude-bridge.log 2>&1 &
SERVER_PID=$!

# Verify server is actually healthy (HTTP 200 from sessions API)
for i in 1 2 3 4 5; do
  sleep 2
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/sessions 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "==> Server running (PID $SERVER_PID)"
    echo "    Logs: /tmp/claude-bridge.log"
    exit 0
  fi
  echo "    Waiting for server... (attempt $i, got HTTP $HTTP_CODE)"
done

echo "ERROR: Server failed to start. Check /tmp/claude-bridge.log"
tail -20 /tmp/claude-bridge.log
exit 1

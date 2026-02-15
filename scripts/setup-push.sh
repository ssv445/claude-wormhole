#!/bin/bash
# Generate VAPID keys and write them to .env.local for push notifications.
# Usage: ./scripts/setup-push.sh [your-https-url-or-email]
#
# Examples:
#   ./scripts/setup-push.sh https://my-machine.tailnet.ts.net
#   ./scripts/setup-push.sh mailto:me@example.com

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$WEB_DIR/.env.local"

# Get VAPID subject from argument or prompt
SUBJECT="$1"
if [ -z "$SUBJECT" ]; then
  echo "VAPID subject identifies your server to push services (Apple/Google)."
  echo "Use your Tailscale HTTPS URL or a mailto: address."
  echo ""
  read -r -p "Enter VAPID subject (https://... or mailto:...): " SUBJECT
fi

if [ -z "$SUBJECT" ]; then
  echo "Error: VAPID subject is required." >&2
  exit 1
fi

# Check if keys already exist in .env.local
if [ -f "$ENV_FILE" ] && grep -q "NEXT_PUBLIC_VAPID_PUBLIC_KEY=." "$ENV_FILE"; then
  read -r -p "VAPID keys already exist in .env.local. Overwrite? [y/N] " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# Generate VAPID keys
echo "Generating VAPID keys..."
KEYS=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)
PUBLIC_KEY=$(echo "$KEYS" | node -e "process.stdin.on('data',d=>{const k=JSON.parse(d);console.log(k.publicKey)})")
PRIVATE_KEY=$(echo "$KEYS" | node -e "process.stdin.on('data',d=>{const k=JSON.parse(d);console.log(k.privateKey)})")

if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
  echo "Error: Failed to generate VAPID keys." >&2
  exit 1
fi

# Write or update .env.local
if [ -f "$ENV_FILE" ]; then
  # Remove existing VAPID lines
  grep -v '^NEXT_PUBLIC_VAPID_PUBLIC_KEY=' "$ENV_FILE" | \
  grep -v '^VAPID_PRIVATE_KEY=' | \
  grep -v '^VAPID_SUBJECT=' > "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

# Append new keys
cat >> "$ENV_FILE" <<EOF
NEXT_PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC_KEY
VAPID_PRIVATE_KEY=$PRIVATE_KEY
VAPID_SUBJECT=$SUBJECT
EOF

echo ""
echo "VAPID keys written to $ENV_FILE"
echo "  Public:  ${PUBLIC_KEY:0:20}..."
echo "  Subject: $SUBJECT"
echo ""
echo "Restart the server to apply: npm run dev"

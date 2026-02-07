# Setup Guide

Complete guide to run Claude Code sessions from your phone using claude-bridge.

**How it works:** Your Mac runs tmux sessions with Claude Code. A Next.js web app exposes those sessions over WebSocket. Tailscale creates a private network so you can access it from your phone without exposing anything to the public internet.

```
Phone (Safari PWA / Terminus SSH)
  |
  |  Tailscale private network
  |
Mac (tmux + Claude Code + web server)
```

## Prerequisites

Install the following on your Mac:

```sh
# tmux - terminal multiplexer
brew install tmux

# sesh - smart tmux session manager
brew install joshmedeski/sesh/sesh

# TPM - tmux plugin manager (for session persistence)
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# Node.js (v20+)
brew install node

# Claude Code
npm install -g @anthropic-ai/claude-code
```

## 1. Tailscale Setup

### Desktop (Mac)

1. Install Tailscale: `brew install --cask tailscale` (or from the Mac App Store)
2. Open Tailscale and sign in to your account
3. **Enable incoming connections:**
   - Click the Tailscale menu bar icon
   - Go to Settings
   - Toggle **"Allow incoming connections"** ON
   - This is required for your phone to reach the Mac

### iOS

1. Install [Tailscale from the App Store](https://apps.apple.com/app/tailscale/id1470499037)
2. Sign in with the **same account** as your Mac
3. Both devices should appear in your Tailscale admin console
4. Verify connectivity - on your phone, try accessing your Mac's Tailscale IP:
   - Find your Mac's IP: `tailscale ip -4` (e.g., `100.x.y.z`)

## 2. Configure tmux

Copy the included tmux config or merge it with your existing `~/.tmux.conf`:

```sh
cp scripts/tmux.conf ~/.tmux.conf
```

This config includes:
- **tmux-resurrect** - saves/restores sessions across tmux server restarts
- **tmux-continuum** - auto-saves sessions every 15 minutes
- Mouse support, scrollback history, 1-indexed windows

Install the plugins:

```sh
# Start tmux
tmux

# Inside tmux, press: prefix + I (capital i) to install plugins
# Default prefix is Ctrl+b
```

## 3. Set Up the `cld` Alias

The `cld` script launches Claude Code inside a tmux session with `--dangerously-skip-permissions` and `--chrome` flags.

Add an alias to your shell config (`~/.zshrc` or `~/.bashrc`):

```sh
# Add this line to ~/.zshrc
alias cld="/path/to/claude-bridge/scripts/cld.sh"
```

Then reload:

```sh
source ~/.zshrc
```

Usage:

```sh
cd ~/projects/my-app
cld                          # auto-detects "my-app" as session name
cld my-session               # custom session name
cld -- --model opus          # pass extra args to claude
```

If sessions matching the project already exist, `cld` will list them and let you pick one or create a new one.

## 4. Start the Web Service

The web app serves a terminal UI that connects to your tmux sessions via WebSocket.

```sh
cd web/

# Install dependencies
npm install

# Development
npm run dev

# Production
npm run build
npm start
```

The server starts on `http://0.0.0.0:3100` by default.

### Expose via Tailscale Serve

To access the web app over HTTPS on your Tailscale network:

```sh
# Serve port 3100 over your Tailscale hostname
tailscale serve --bg 3100
```

Your app is now available at:

```
https://your-machine-name.tailnet-name.ts.net/
```

To stop serving:

```sh
tailscale serve --bg off
```

## 5. Run as Service (Auto-start + Keepalive)

The web server can be configured to start automatically on login and restart if it crashes, using macOS launchd.

### Install

```sh
./scripts/service.sh install
```

This will:
1. Build the web app (`npm run build`)
2. Enable `tailscale serve --bg 3100`
3. Copy the launchd plist to `~/Library/LaunchAgents/`
4. Load and start the agent

### Manage

```sh
./scripts/service.sh status    # Check if running
./scripts/service.sh logs      # Tail stdout + stderr
./scripts/service.sh restart   # Stop + start
./scripts/service.sh stop      # Stop the agent
./scripts/service.sh start     # Start the agent
```

### Uninstall

```sh
./scripts/service.sh uninstall
```

### Standalone start (without launchd)

If you prefer to start manually without the service:

```sh
./scripts/start.sh
```

This builds if needed, enables tailscale serve, and starts the server.

### Logs

Logs are written to:
- **stdout**: `/tmp/claude-bridge.log`
- **stderr**: `/tmp/claude-bridge.err`

## 6. Backup: SSH via Terminus

If the web UI is down or you prefer a native terminal, use SSH as a fallback.

### On your Mac

Ensure SSH is enabled:
- System Settings > General > Sharing > Remote Login > ON

### On iOS

1. Install [Terminus](https://apps.apple.com/app/termius-terminal-ssh-client/id549039908) from the App Store
2. Create a new host:
   - **Hostname:** Your Mac's Tailscale IP (e.g., `100.x.y.z`)
   - **Username:** Your Mac username (e.g., `john`)
   - **Auth:** SSH key (recommended) or password
3. Connect and attach to your tmux session:

```sh
# List sessions
tmux ls

# Attach to a session
tmux attach -t my-app
```

This works anywhere on your Tailscale network without exposing SSH to the public internet.

## 7. Install the PWA on iOS

The web app includes a PWA manifest for an app-like experience on your phone.

1. Open Safari on your iPhone
2. Navigate to your Tailscale serve URL (e.g., `https://your-machine-name.tailnet-name.ts.net/`)
3. Tap the **Share** button (square with arrow)
4. Scroll down and tap **"Add to Home Screen"**
5. Name it (e.g., "tmux") and tap **Add**

The PWA runs in standalone mode (no Safari chrome) with a dark theme optimized for terminal use.

## Quick Reference

| What | Command |
|---|---|
| Start a Claude session | `cd ~/projects/my-app && cld` |
| Start web server | `cd web && npm run dev` |
| Tailscale serve | `tailscale serve --bg 3100` |
| Stop Tailscale serve | `tailscale serve --bg off` |
| List tmux sessions | `tmux ls` |
| Attach to session (SSH) | `tmux attach -t session-name` |
| Mac Tailscale IP | `tailscale ip -4` |

## Troubleshooting

**Phone can't reach Mac over Tailscale**
- Check "Allow incoming connections" is ON in Tailscale settings on Mac
- Verify both devices are on the same Tailscale network: `tailscale status`
- macOS firewall (pf rules) alone won't fix this - you need Tailscale's own setting

**Web app loads but terminal doesn't connect**
- Make sure a tmux session exists first: `tmux ls`
- The web app attaches to existing sessions, it doesn't create them

**`cld` command not found**
- Ensure the alias is in your `~/.zshrc` and you've run `source ~/.zshrc`
- Check the script is executable: `chmod +x /path/to/claude-bridge/scripts/cld.sh`

**tmux plugins not loading**
- Run `prefix + I` inside tmux to install plugins via TPM
- Check TPM is cloned: `ls ~/.tmux/plugins/tpm`

# tmux-tunnel

Run Claude Code from your phone. No public servers, no latency hacks - just your Mac, tmux, and a private Tailscale network.

## The Problem

You're away from your desk but need to check on a Claude Code session, give it a quick instruction, or start a new one. VS Code tunnels work but are clunky on mobile. SSH from your phone is possible but painful to set up securely.

## What This Does

tmux-tunnel gives you a web-based terminal that connects to tmux sessions on your Mac, accessible from any device on your Tailscale network.

```
iPhone (PWA)  ──┐
iPad (Safari) ──┤  Tailscale    ┌─────────────────────┐
Laptop (SSH)  ──┼─────────────> │  Mac                 │
                │  private net  │  tmux                │
                │               │   ├─ my-app (claude) │
                │               │   ├─ api (claude)    │
                │               │   └─ scripts (bash)  │
                │               └─────────────────────┘
```

**What you get:**
- Start and manage Claude Code sessions from anywhere
- Sessions persist across disconnects - pick up where you left off
- PWA on iOS for an app-like experience (no Safari chrome)
- SSH fallback via Terminus for a native terminal option
- Everything stays on your private network - nothing exposed to the internet

## Components

| Path | What |
|---|---|
| `web/` | Next.js web app with xterm.js terminal + WebSocket server |
| `scripts/cld.sh` | CLI to launch Claude Code in tmux with `--dangerously-skip-permissions --chrome` |
| `scripts/tmux.conf` | tmux config with session persistence (resurrect + continuum) |
| `vscode/profiles/` | Touch-optimized VS Code profile for mobile |
| `vscode/extension/` | VS Code sidebar for tmux session management |

## Quick Start

```sh
# 1. Set up the cld alias
echo 'alias cld="/path/to/tmux-tunnel/scripts/cld.sh"' >> ~/.zshrc
source ~/.zshrc

# 2. Start a Claude session
cd ~/projects/my-app
cld

# 3. Start the web server
cd web && npm install && npm run dev

# 4. Expose over Tailscale
tailscale serve --bg 3100

# 5. Open on your phone
# https://your-machine.tailnet.ts.net/
```

## Full Setup

See **[SETUP.md](SETUP.md)** for the complete guide:
- Installing Tailscale on Mac and iOS
- Configuring tmux with session persistence
- Setting up the `cld` alias
- Running the web service
- SSH backup via Terminus
- Installing the PWA on iOS

## License

MIT

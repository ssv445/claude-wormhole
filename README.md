# claude-wormhole

Never leave Claude Code waiting. Access your sessions from terminal, VS Code, browser, or phone - same session, any device, zero interruption.

## The Problem

Claude Code runs a 10-minute task, hits a question, and blocks. You're on the couch, in a meeting, or grabbing coffee. By the time you're back at your desk, you've lost 20 minutes of momentum on a 2-second approval.

The underlying issue: Claude Code sessions are tied to whichever terminal spawned them. Close the tab, lose the session. Walk away from the machine, no way to respond.

## The Solution

claude-wormhole decouples sessions from any single interface. A Claude Code session runs inside tmux on your Mac. You connect to it from whatever is in front of you right now.

```
Desktop terminal  ──┐
VS Code           ──┤                ┌─────────────────────┐
Browser (PWA)     ──┼── Tailscale ──>│  Mac                 │
Phone (PWA)       ──┤   private net  │  tmux                │
SSH (Terminus)    ──┘                │   ├─ my-app (claude) │
                                     │   ├─ api (claude)    │
                                     │   └─ scripts (bash)  │
                                     └─────────────────────┘
```

The session is the same across all channels. Start something on your desktop, approve a prompt from your phone, review the result back on your laptop. No context lost, no session restarts.

**How it works:**
- **tmux** keeps sessions alive independent of any client connection
- **Next.js + xterm.js + WebSocket** serves a browser-based terminal that attaches to tmux sessions
- **Tailscale** creates a private network between your devices - nothing exposed to the internet
- **PWA** makes the web terminal installable on iOS with no browser chrome

## Components

| Path | What |
|---|---|
| `web/` | Next.js app + WebSocket server. node-pty spawns tmux attach, pipes I/O over ws to xterm.js |
| `scripts/cld.sh` | CLI to launch Claude Code in tmux with `--dangerously-skip-permissions --chrome` |
| `scripts/tmux.conf` | tmux config with resurrect + continuum for session persistence across reboots |
| `vscode/extension/` | VS Code sidebar for tmux session management |
| `vscode/profiles/` | Touch-optimized VS Code profile for mobile |

## Quick Start

```sh
# 1. Set up the cld alias
echo 'alias cld="/path/to/claude-wormhole/scripts/cld.sh"' >> ~/.zshrc
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

## Why This Approach?

VS Code tunnels, webmux, and SSH were all tried first. See **[WHY.md](WHY.md)** for what failed, what worked, and the 2-hour Tailscale debugging rabbit hole.

## Full Setup

See **[SETUP.md](SETUP.md)** for the complete walkthrough:
- Installing Tailscale on Mac and iOS
- Configuring tmux with session persistence
- Setting up the `cld` alias
- Running the web service
- SSH fallback via Terminus
- Installing the PWA on iOS

## License

MIT

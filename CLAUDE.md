# tmux-tunnel

Access Claude Code sessions from your phone over a private Tailscale network.

## Purpose

Web-based terminal UI + CLI tooling to manage tmux sessions (especially Claude Code) from any device. Uses Tailscale for private networking - nothing exposed to the public internet. Installable as a PWA on iOS.

## Status: active

## Components

```
tmux-tunnel/
├── web/                      # Next.js app + WebSocket server (port 3100)
│   ├── server.ts             # Custom server with node-pty + ws
│   ├── src/app/              # Next.js pages (session list, terminal)
│   └── public/               # PWA manifest + icons
├── scripts/
│   ├── cld.sh                # CLI: launch Claude Code in tmux sessions
│   └── tmux.conf             # tmux config with resurrect + continuum
├── vscode/
│   ├── extension/            # VS Code sidebar for session management
│   └── profiles/             # Touch-optimized VS Code profile
├── SETUP.md                  # Full setup guide
└── CLAUDE.md
```

## Tech Stack

- **Web**: Next.js, xterm.js, node-pty, WebSocket (ws)
- **CLI**: Bash, tmux, sesh
- **Networking**: Tailscale serve (HTTPS)
- **VS Code**: TypeScript extension, .code-profile

## Key Architecture

- `web/server.ts` - Custom HTTP server that upgrades WebSocket connections at `/api/terminal?session=<name>`, spawns node-pty processes that attach to tmux sessions
- `scripts/cld.sh` - Always passes `--dangerously-skip-permissions --chrome` to Claude Code, uses sesh for session management
- `scripts/tmux.conf` - Includes tmux-resurrect and tmux-continuum for session persistence across reboots

## Dev Commands

```sh
# Web app
cd web && npm run dev          # Development (port 3100)
cd web && npm run build        # Production build
cd web && npm start            # Production server

# Tailscale
tailscale serve --bg 3100      # Expose over Tailscale HTTPS
tailscale serve --bg off       # Stop serving

# Claude sessions
cld                            # Launch Claude in tmux (needs alias)
tmux ls                        # List sessions
```

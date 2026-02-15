# claude-wormhole

A bridge between you and your Claude Code sessions, from any device over a private Tailscale network.

## Purpose

Web-based terminal UI + CLI tooling to manage tmux sessions (especially Claude Code) from any device. Uses Tailscale for private networking - nothing exposed to the public internet. Installable as a PWA on iOS.

## Status: active

## Components

```
claude-wormhole/
├── server.ts                 # Custom server with node-pty + ws (port 3100)
├── src/app/                  # Next.js pages (session list, terminal)
├── public/                   # PWA manifest + icons
├── scripts/
│   ├── cld.sh                # CLI: launch Claude Code in tmux sessions
│   └── tmux.conf             # tmux config with resurrect + continuum
├── SETUP.md                  # Full setup guide
└── CLAUDE.md
```

## Tech Stack

- **Web**: Next.js, xterm.js, node-pty, WebSocket (ws)
- **CLI**: Bash, tmux, sesh
- **Networking**: Tailscale serve (HTTPS)

## Key Architecture

- `server.ts` - Custom HTTP server that upgrades WebSocket connections at `/api/terminal?session=<name>`, spawns node-pty processes that attach to tmux sessions
- `scripts/cld.sh` - Always passes `--dangerously-skip-permissions --chrome` to Claude Code, uses sesh for session management
- `scripts/tmux.conf` - Includes tmux-resurrect and tmux-continuum for session persistence across reboots

## Dev Commands

```sh
# Web app
npm run dev                    # Development (port 3100)
npm run build                  # Production build
npm start                      # Production server
./restart.sh                   # Kill → clean build → start (recommended)

# Tailscale
tailscale serve --bg 3100      # Expose over Tailscale HTTPS
tailscale serve --bg off       # Stop serving

# Claude sessions
cld                            # Launch Claude in tmux (needs alias)
tmux ls                        # List sessions
```

## Mobile Terminal Scrolling — Critical Architecture Notes

### Scrollback lives in tmux, NOT xterm.js
- xterm.js only holds the few lines it receives on screen. Historical output is in tmux's scrollback buffer.
- `term.scrollLines()` is nearly useless — it only scrolls xterm's tiny local buffer.
- To scroll tmux's buffer, send **SGR mouse wheel escape sequences** through the WebSocket:
  - Scroll up: `\x1b[<64;1;1M`
  - Scroll down: `\x1b[<65;1;1M`
- tmux with `mouse on` auto-enters copy mode on scroll up — no manual copy mode management needed.

### Claude Code consumes PgUp/PgDn
- PgUp/PgDn escape sequences get eaten by Claude Code running inside tmux.
- To scroll past Claude Code, use tmux prefix + `[` (`\x02[`) to enter copy mode first, then PgUp/PgDn.
- The scroll buttons in the mobile UI use this approach as a fallback.

### Touch event handling on iOS
- xterm.js v5 sets `touch-action: none` on its canvas and may call `stopPropagation()` on touch events.
- Use `{ capture: true }` on touch listeners to intercept events before xterm.js swallows them.
- One-finger swipe is the natural iOS gesture (two-finger scroll is macOS trackpad only).
- Call `term.blur()` on scroll start to dismiss iOS input accessories bar.
- CSS `overflow: hidden; overscroll-behavior: none; position: fixed` on html/body prevents iOS page bounce.

### Native keyboard handling
- `window.visualViewport` resize event detects iOS native keyboard open/close.
- Keyboard height = `window.innerHeight - visualViewport.height`.
- Shrink the terminal container by keyboard height so the input line stays visible.
- Call `fitAddon.fit()` after resize to refit terminal to the new available space.

### Server restart procedure
- Use `./restart.sh` — it handles kill → wait for port → clean build → start with nohup.
- `npm run dev` and `npm start` both use port 3100. Dev server child processes can linger after kill.
- Always verify port is free before starting: `lsof -ti:3100 || echo "free"`

# claude-wormhole

Access your Claude Code sessions from any device over a private Tailscale network.

## Purpose

Web-based terminal UI + CLI tooling to manage tmux sessions (especially Claude Code) from any device. Uses Tailscale for private networking - nothing exposed to the public internet. Installable as a PWA on iOS.

## Status: active

## Components

```
claude-wormhole/
├── bin/
│   ├── wormhole              # CLI: single command for everything
│   └── env.sh                # Shared environment for all scripts
├── server.ts                 # Custom server with node-pty + ws (port 3100)
├── src/app/                  # Next.js pages (session list, terminal)
├── public/                   # PWA manifest + icons
├── scripts/
│   ├── tmux.conf             # tmux config with resurrect + continuum
│   ├── com.claude-wormhole.web.plist  # launchd plist
│   └── statusline-test.sh    # Test harness for statusline
├── docs/
│   ├── setup.md              # Full setup guide
│   └── why.md                # Architecture decisions
├── install.sh                # One-shot setup
└── CLAUDE.md
```

## Tech Stack

- **Web**: Next.js, xterm.js, node-pty, WebSocket (ws)
- **CLI**: Bash (`bin/wormhole`), tmux, sesh
- **Networking**: Tailscale serve (HTTPS)

## Key Architecture

- `server.ts` - Custom HTTP server that upgrades WebSocket connections at `/api/terminal?session=<name>`, spawns node-pty processes that attach to tmux sessions
- `bin/wormhole` - Single CLI dispatcher: cld, start, restart, stop, status, monitor, service, notify, statusline, setup, release
- `bin/env.sh` - Shared environment sourced by wormhole: sets WORMHOLE_ROOT, WORMHOLE_URL, PATH, log helpers
- `scripts/tmux.conf` - Includes tmux-resurrect and tmux-continuum for session persistence across reboots

## Worktree Development

Each feature branch runs in its own git worktree with a unique port via `.env.local` (gitignored). This avoids port conflicts when running multiple dev servers.

- Main worktree: port 3100
- Feature worktrees: 3101, 3102, etc.
- Each worktree needs its own `tailscale serve` binding

```sh
# Create a worktree for a feature branch
git worktree add .worktrees/<branch-name> -b <branch-name>
cd .worktrees/<branch-name>
echo "PORT=<next-free-port>" > .env.local
npm install
tailscale serve --bg --https=$PORT http://127.0.0.1:$PORT
```

## Dev Commands

```sh
# Web app
npm run dev                    # Development (port 3100)
npm run build                  # Production build
wormhole start                 # Build-if-needed + start server
wormhole restart               # Kill + clean build + start
wormhole stop                  # Stop server
wormhole status                # Check system health

# Tailscale — bind to the same port as PORT in .env.local
tailscale serve --bg --https=$PORT http://127.0.0.1:$PORT
tailscale serve --https=$PORT off  # Stop serving

# Claude sessions
cld                            # Launch Claude in tmux (alias for wormhole cld)
tmux ls                        # List sessions

# Service (launchd)
wormhole service install       # Auto-start on login
wormhole service logs          # Tail logs
```

## Mobile Terminal Scrolling — Critical Architecture Notes

### Scrollback lives in tmux, NOT xterm.js
- xterm.js only holds the few lines it receives on screen. Historical output is in tmux's scrollback buffer.
- `term.scrollLines()` is nearly useless — it only scrolls xterm's tiny local buffer.

### Claude Code captures mouse & keyboard events
- Claude Code is a TUI that enables mouse tracking (`mouse_any_flag`). tmux's default `WheelUpPane` binding forwards SGR mouse wheel events to Claude Code instead of scrolling.
- SGR mouse wheel sequences (`\x1b[<64;1;1M` etc.) do NOT work for scrollback while Claude Code is running.
- **Working approach**: Enter tmux copy mode via prefix (`\x02[`), then send PgUp/PgDn (`\x1b[5~` / `\x1b[6~`). Both the scroll FAB buttons and touch scroll use this mechanism.
- `scripts/tmux.conf` has a `WheelUpPane` override to force copy mode entry, bypassing `mouse_any_flag`. This helps but the copy mode + PgUp/PgDn approach is more reliable.
- User exits copy mode via the "Exit copy mode" toolbar button (sends `q` to tmux).

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
- Use `wormhole restart` — it handles kill + wait for port + clean build + start with nohup.
- `npm run dev` and `npm start` both use port 3100. Dev server child processes can linger after kill.
- Always verify port is free before starting: `lsof -ti:3100 || echo "free"`

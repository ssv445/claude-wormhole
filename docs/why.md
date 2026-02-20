# Why This Approach?

What was tried, what failed, and why claude-wormhole ended up as tmux + custom web UI + Tailscale.

## What Failed

### VS Code Tunnel + Mobile Profile

**Idea:** Use VS Code's tunnel to access sessions from a phone with a custom tmux extension.

**Result:** Dead on arrival for mobile.
- Extensions don't load in VS Code's browser mode
- Mobile profile wouldn't auto-apply via tunnel
- Settings sync was broken (possibly paywalled)
- VS Code's web UI is unusable on small screens — too many panels, too much chrome

### webmux (Open Source)

**Idea:** Use an existing open-source web-based tmux client.

**Result:** More time debugging the tool than building a simpler one.
- Required the full Rust toolchain
- Broken node_modules out of the box
- Didn't detect existing tmux sessions once running

### Tailscale Networking (2-Hour Rabbit Hole)

**Idea:** Serve the web app on a port, access from any device on the tailnet. Should be trivial.

**What happened:** Phone got connection timeouts. Tried macOS application firewall, pfctl rules, pf anchors, 10+ server restart configs. Nothing worked.

**The fix:** Tailscale > Settings > "Allow incoming connections" > ON. One toggle. All the firewall debugging was a red herring.

**Lesson:** When Tailscale connections fail, check Tailscale's own settings before touching the OS firewall.

## Why the Current Stack Works

**tmux** — Sessions survive disconnects, terminal closures, even reboots (with resurrect + continuum). Multiple clients attach simultaneously. Zero overhead, battle-tested.

**Custom web UI (Next.js + xterm.js + WebSocket)** — Built exactly for the use case. xterm.js renders a real terminal, node-pty spawns `tmux attach` and pipes I/O over WebSocket. Mobile-first with a virtual keyboard for Claude Code shortcuts (Ctrl+C, Ctrl+G, etc.) since phone keyboards can't send control sequences. PWA mode removes browser chrome on iOS.

**Tailscale** — Nothing exposed to the public internet, no auth layer needed. HTTPS via `tailscale serve` with automatic certs.

**Why not just SSH?** — SSH works and is documented as a fallback (via Terminus). But: SSH key setup on iOS is friction, Terminus is paid for full features, no session list UI, and the web UI is faster for quick interactions (tap a session, send a keystroke, done).

## Mobile Challenges Solved

**Virtual keyboard** — Phone keyboards can't send control sequences. Three iterations: floating draggable keyboard (annoying) > 42 Claude Code shortcuts (right keys, wrong UX) > fixed bottom bar where the terminal shrinks to make room.

**iOS quirks:**
- No Fullscreen API in Safari — PWA mode via "Add to Home Screen" removes browser chrome
- PWA detection needs both `display-mode: standalone` media query and `navigator.standalone`
- Viewport height uses `dvh` instead of `vh` to handle Safari's collapsing address bar

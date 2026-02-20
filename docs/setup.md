# Setup Guide

Complete guide to set up claude-wormhole — access Claude Code sessions from any device over a private Tailscale network.

```
Phone (Safari PWA / SSH)
  │
  │  Tailscale private network
  │
Mac (tmux + Claude Code + web server)
```

## Automated Install

The fastest path — handles prerequisites check, build, CLI setup, and hooks:

```sh
./install.sh
```

This will:
1. Check prerequisites (tmux, node, jq, claude)
2. `npm install` + `npm run build`
3. Symlink `wormhole` to `/usr/local/bin/wormhole`
4. Set up tmux config
5. Configure Claude Code notification hooks
6. Enable Tailscale serve
7. Add `cld` shell alias

After install, verify with `wormhole status`.

## Manual Setup

If you prefer to set things up step by step:

### Prerequisites

```sh
brew install tmux                              # terminal multiplexer
brew install joshmedeski/sesh/sesh             # smart tmux session manager
brew install node                              # Node.js (v20+)
npm install -g @anthropic-ai/claude-code       # Claude Code CLI

# tmux plugin manager (for session persistence)
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

### 1. Tailscale

#### Mac

1. Install: `brew install --cask tailscale` (or Mac App Store)
2. Open Tailscale and sign in
3. **Enable incoming connections** — Tailscale menu bar > Settings > "Allow incoming connections" ON
   - Without this, your phone can't reach the Mac (see Troubleshooting)

#### iOS

1. Install [Tailscale](https://apps.apple.com/app/tailscale/id1470499037) and sign in with the **same account**
2. Verify both devices appear in your Tailscale admin console
3. Test connectivity: find your Mac's IP with `tailscale ip -4`

### 2. tmux

Copy the included config or merge with your existing `~/.tmux.conf`:

```sh
cp scripts/tmux.conf ~/.tmux.conf
tmux    # start tmux, then press prefix + I to install plugins
```

Includes tmux-resurrect (save/restore sessions) and tmux-continuum (auto-save every 15 min).

### 3. The `cld` Command

After running `install.sh`, `cld` is available as a shell alias for `wormhole cld`:

```sh
cd ~/projects/my-app
cld                          # auto-detects "my-app" as session name
cld -- --model opus          # pass extra args to claude
```

Or set it up manually:

```sh
# Add to ~/.zshrc
alias cld="wormhole cld"
source ~/.zshrc
```

### 4. Web Server

```sh
wormhole start               # build-if-needed + start server

# or for development:
npm run dev                  # port 3100
```

#### Expose via Tailscale

```sh
tailscale serve --bg 3100                    # serve over HTTPS
# Available at: https://your-machine.tailnet.ts.net/
tailscale serve --bg off                     # stop serving
```

### 5. Run as Service (Auto-start)

Auto-start on login with crash recovery via macOS launchd:

```sh
wormhole service install     # build + enable tailscale serve + load agent
wormhole service status      # check if running
wormhole service logs        # tail stdout + stderr
wormhole service restart     # stop + start
wormhole service uninstall   # remove agent
```

Logs: `/tmp/claude-wormhole.log` and `/tmp/claude-wormhole.err`

### 6. Push Notifications (Optional)

Get notified when Claude needs input or finishes a task — even when the PWA isn't open.

```sh
wormhole setup push https://your-machine.tailnet.ts.net
wormhole restart
```

Then open the PWA on your phone and tap **Enable** on the notification banner.

#### Claude Code hooks

The `install.sh` script configures these automatically. For manual setup, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-wormhole/bin/wormhole notify",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-wormhole/bin/wormhole notify",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

The hook defaults to `http://localhost:3100`. Set `CLAUDE_WORMHOLE_URL` to override.

Test:

```sh
curl -X POST http://localhost:3100/api/notify \
  -H "Content-Type: application/json" \
  -d '{"type": "idle", "message": "Test notification", "session": "my-session"}'
```

### 7. Install the PWA on iOS

1. Open Safari > your Tailscale serve URL
2. Tap **Share** > **Add to Home Screen**
3. Name it (e.g., "wormhole") and tap **Add**

Runs in standalone mode with no browser chrome, dark theme optimized for terminal use.

### 8. SSH Fallback

If the web UI is down, use SSH via Tailscale:

1. Mac: System Settings > General > Sharing > Remote Login > ON
2. iOS: Install [Terminus](https://apps.apple.com/app/termius-terminal-ssh-client/id549039908), connect to your Mac's Tailscale IP
3. `tmux attach -t my-app`

## Quick Reference

| What | Command |
|---|---|
| Start Claude session | `cd ~/projects/my-app && cld` |
| Start web server | `wormhole start` |
| Restart server | `wormhole restart` |
| Check health | `wormhole status` |
| Tailscale serve | `tailscale serve --bg 3100` |
| Stop Tailscale serve | `tailscale serve --bg off` |
| Setup push notifications | `wormhole setup push <your-url>` |
| List tmux sessions | `tmux ls` |
| Mac Tailscale IP | `tailscale ip -4` |

## Troubleshooting

**Phone can't reach Mac over Tailscale**
- Check "Allow incoming connections" is ON in Tailscale settings on Mac
- Verify both devices are on the same network: `tailscale status`
- macOS firewall (pf rules) won't help — you need Tailscale's own setting

**Terminal doesn't connect**
- A tmux session must exist first: `tmux ls`
- The web app attaches to existing sessions, it doesn't create them

**`wormhole` not found**
- Run `install.sh` again, or manually: `sudo ln -sf /path/to/claude-wormhole/bin/wormhole /usr/local/bin/wormhole`

**`cld` not found**
- Ensure the alias is in `~/.zshrc` and you've run `source ~/.zshrc`
- Or run directly: `wormhole cld`

**tmux plugins not loading**
- Run `prefix + I` inside tmux to install via TPM
- Check TPM is cloned: `ls ~/.tmux/plugins/tpm`

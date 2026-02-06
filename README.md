# tmux-tunnel

Remote tmux session management for VS Code with mobile support.

## Why?

When running Claude Code sessions on a remote machine (via VS Code tunnel), you need a way to:

1. **Persist sessions** - Keep Claude conversations alive across disconnects
2. **Manage multiple projects** - Switch between different Claude sessions easily
3. **Work from anywhere** - Access sessions from desktop, tablet, or phone
4. **Full terminal features** - Image pasting, colors, scrollback all work

tmux solves session persistence. This project adds the management layer.

## What It Does

```
┌─────────────────────────────────────────────────────────┐
│  VS Code                                                │
│  ┌─────────────────┐  ┌──────────────────────────────┐ │
│  │ TMUX SESSIONS   │  │ Terminal                     │ │
│  │                 │  │                              │ │
│  │ 🟢 my-webapp    │  │ $ claude                     │ │
│  │ ⚪ api-server   │  │ ╭────────────────────────╮   │ │
│  │ ⚪ mobile-app   │  │ │ What would you like    │   │ │
│  │                 │  │ │ to work on?            │   │ │
│  │ [+ New Session] │  │ ╰────────────────────────╯   │ │
│  └─────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- **Tree view** in VS Code sidebar listing all tmux sessions
- **One click** to attach to any session
- **Working directory** shown for each session
- **Create sessions** with or without Claude auto-start
- **Works over VS Code tunnel** for remote access

## Components

### 1. VS Code Extension (`vscode-extension/`)

Lists and manages tmux sessions from VS Code sidebar.

**Features:**
- Tree view with session list
- Shows project name from working directory
- Attached sessions highlighted (green icon)
- Right-click context menu: Attach, Kill
- Commands: New Session, New Session with Claude

**Install:**
```bash
cd vscode-extension
npm install
npm run compile
vsce package --allow-missing-repository
code --install-extension tmux-sessions-0.1.0.vsix
```

### 2. CLI Script (`scripts/claude-session`)

Quick launcher for Claude sessions from terminal.

**Usage:**
```bash
# Install to PATH
cp scripts/claude-session ~/.local/bin/cs
chmod +x ~/.local/bin/cs

# Use from any project directory
cd ~/projects/my-app
cs                    # Auto-detects project name
cs my-custom-name     # Or specify session name
```

**What it does:**
1. Detects project from current directory
2. Lists existing sessions for this project
3. Lets you reuse existing or create new
4. Auto-launches Claude in new sessions

### 3. Mobile Profile (`profiles/Mobile.code-profile`)

Touch-optimized VS Code settings for tablet/phone use.

**Settings:**
- 150% zoom, 18pt font
- Hidden: minimap, breadcrumbs, activity bar, line numbers
- Single tab mode
- Optimized Zen Mode (`Cmd+K Z`)

**Import:**
```
Cmd+Shift+P → "Profiles: Import Profile..."
→ Select profiles/Mobile.code-profile
```

## Prerequisites

**Required:**
- tmux (`brew install tmux`)

That's it! The extension works with just tmux.

## How Sessions Work

```
You (laptop/phone/tablet)
         │
         │ VS Code Tunnel
         ▼
┌─────────────────────────┐
│  Remote Machine         │
│  ┌───────────────────┐  │
│  │ tmux              │  │
│  │  ├─ my-webapp     │  │  ← Claude running here
│  │  ├─ api-server    │  │  ← Another Claude session
│  │  └─ mobile-app    │  │  ← Detached, waiting
│  └───────────────────┘  │
└─────────────────────────┘
```

1. **tmux** keeps sessions alive on remote machine
2. **VS Code tunnel** connects you from any device
3. **This extension** lists sessions in sidebar
4. **Click to attach** opens VS Code terminal with that session
5. **Disconnect anytime** - session persists, reconnect later

## Workflow

### Starting a new project

```bash
cd ~/projects/new-project
cs
# Creates "new-project" session with Claude
```

### Resuming work

1. Open VS Code (locally or via tunnel)
2. Look at "Tmux Sessions" in sidebar
3. Click session to attach
4. Continue where you left off

### Mobile access

1. Import Mobile profile
2. Switch to Mobile profile: `Cmd+Shift+P` → "Profiles: Switch Profile"
3. Use Zen Mode: `Cmd+K Z` for maximum screen space
4. Tap sessions in sidebar to attach

## Commands

| Command | Description |
|---------|-------------|
| `Tmux: Refresh Sessions` | Reload session list |
| `Tmux: Attach to Session` | Pick session from list |
| `Tmux: New Session` | Create empty session |
| `Tmux: New Session with Claude` | Create session + start Claude |
| `Tmux: Detach from Session` | Close terminal and detach |
| `Tmux: Kill Session` | Terminate a session |

## Recommended Workflow

For the best experience, set up session persistence:

### 1. Install tmux-resurrect

Saves and restores tmux sessions across reboots.

```bash
# Add to ~/.tmux.conf
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'

# Install TPM if not already installed
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# Reload tmux config
tmux source ~/.tmux.conf

# Press prefix + I (Ctrl+B, then Shift+I) to install plugins
```

**Usage:**
- `Ctrl+B Ctrl+S` - Save all sessions
- `Ctrl+B Ctrl+R` - Restore saved sessions

### 2. Install sesh (optional)

Smart session manager with fuzzy finding.

```bash
brew install joshmedeski/sesh/sesh
```

### 3. Configure auto-save (optional)

Add to `~/.tmux.conf` for automatic session saves:

```bash
# Save sessions every 15 minutes
set -g @resurrect-save-interval '15'

# Auto-restore on tmux start
set -g @resurrect-restore 'on'
```

### 4. Workflow

```bash
# Start work
cd ~/projects/my-app
cs                    # Creates/attaches session

# Work in VS Code
# - Sessions auto-listed in sidebar
# - Click to attach
# - Detach to switch projects

# Before shutdown
Ctrl+B Ctrl+S        # Save all sessions

# After reboot
Ctrl+B Ctrl+R        # Restore everything
```

## License

MIT

# tmux-tunnel

Remote tmux session management for VS Code with mobile support.

## Purpose

Manage tmux sessions (especially Claude Code sessions) from anywhere:
- VS Code extension with tree view for sessions
- Mobile-friendly VS Code profile
- CLI tools for session management
- Works over VS Code tunnel

## Status: active
## Mode: professional

## Components

```
tmux-tunnel/
├── vscode-extension/     # VS Code extension
│   ├── src/
│   │   ├── extension.ts      # Entry point
│   │   ├── sessionProvider.ts # Tree view
│   │   └── tmux.ts           # Tmux commands
│   └── package.json
├── profiles/
│   └── Mobile.code-profile   # Touch-friendly VS Code profile
├── scripts/
│   └── claude-session        # CLI for quick session launch
└── CLAUDE.md
```

## Features

### VS Code Extension
- [ ] Tree view listing all tmux sessions
- [ ] Click to attach (opens VS Code terminal with `tmux attach`)
- [ ] Create new session (with optional Claude auto-start)
- [ ] Kill/rename sessions
- [ ] Works over VS Code tunnel

### Mobile Profile
- [x] 150% zoom, 18pt font
- [x] Hidden: minimap, breadcrumbs, activity bar
- [x] Single tab mode
- [x] Optimized Zen Mode

### CLI (`cs` command)
- [x] Detect project from current directory
- [x] List existing sessions
- [x] Reuse or create new session
- [x] Auto-launch Claude in new sessions

## Next Tasks

1. Scaffold VS Code extension with package.json
2. Implement TmuxSessionProvider (tree view)
3. Add attach/create/kill commands
4. Test over tunnel
5. (Future) Mobile web UI fallback

## Tech Stack

- **Extension**: TypeScript, VS Code Extension API
- **CLI**: Bash
- **Profile**: VS Code .code-profile format

## Related

- `cld-master` - Core tmux/Claude session library (dependency)
- VS Code tunnel (already configured)

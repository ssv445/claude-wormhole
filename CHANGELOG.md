# Changelog

## [1.3.0] - 2026-03-28

### Features

- feat: viewport monitor — single source of truth for viewport state
- feat: hook-driven session status indicators
- feat: add Restart All in sessions header dropdown menu
- feat: add restart button to session dropdown menu
- feat: add right-click copy and selection mode for desktop browser
- feat: replace free-text dir input with project dropdown in NewSessionDialog
- feat: add GET /api/projects route to scan PROJECTS_DIR for git repos
- feat: unify session list, remove Attached/Available split (#60) (#61)
- feat: replace inline session buttons with dropdown menu (#58) (#59)
- feat: add per-session pause/resume to reduce idle memory usage (#56)
- feat: dev server binds 0.0.0.0 for LAN/simulator access
- feat: add `wormhole dev` command for dev server with Tailscale HTTPS
- feat: DEV WORMHOLE branding in development mode

### Bug Fixes

- fix: improve mobile readability — bump font sizes and muted color contrast
- fix: remember dismissed notification prompt across reloads
- fix: add 'working' and 'idle' text labels to session status
- fix: only show 'waiting' status on the active tab
- fix: suppress notifications from subagent runs
- fix: prevent tmux context menu on right-click
- fix: preserve text selection in copy mode on mouse-up
- fix: address code review findings
- fix: remove dead lstat call and strip trailing slash from PROJECTS_DIR
- fix: wire onNewInDir on mobile SessionList for project-based new session
- fix: preserve paused sessions across server restarts
- fix: mobile layout improvements and touch scrolling (#50)
- fix: bottom white bar and compact mobile top bar
- fix: mobile keyboard layout — safe-area, empty state, resize on tab switch (#50)

### Refactoring

- refactor: extract Sidebar component, merge menus into single dropdown
- refactor: remove pause/resume, add hook-driven status state machine

### Other

- chore: sync package.json version to v1.2.1
- Merge pull request #65 from ssv445/feat/viewport-monitor
- test: update tests for viewport monitor refactor
- docs: viewport monitor design spec
- docs: add iOS simulator testing instructions to CLAUDE.md
- Merge pull request #64 from ssv445/feat/restart-claude-session
- Merge pull request #63 from ssv445/fix/browser-copy-mode
- Merge pull request #62 from ssv445/feat/projects-folder
- chore: add .worktrees/ to .gitignore
- Merge pull request #57 from ssv445/feat/issue-56-session-pause-resume
- Merge pull request #51 from ssv445/feat/issue-50-fix-mobile-layout
- review: address review feedback — docs, constants, comments
- review: address code review feedback
- demo corrected


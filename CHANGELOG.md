# Changelog

## [1.6.0] - 2026-04-10

### Features

- feat: session trash + durable sessions.json protection

### Bug Fixes

- fix: release script awk newline error on multiline commit messages


## [1.5.1] - 2026-04-08

### Bug Fixes

- fix: scope WebGL addon to the active tab only — background attached tabs use xterm's DOM renderer. Chrome caps concurrent WebGL contexts at 16 per origin, so mounting more terminals than that triggered a context-loss ping-pong loop visible as a repeating blank flash across every pane. Only the active tab now holds a GPU context.

### Features

- feat: `sessions.json` is now a **curated set** of user-attached sessions rather than "every live tmux session". The 60s sync only refreshes metadata for existing entries and never auto-adds new ones.
- feat: sidebar shows only **attached** sessions; detached sessions live in a new "Open Session…" dropdown under the header ⋮ menu.
- feat: sidebar sessions are grouped by folder path (alphabetical, case-insensitive), newest-first within each folder.
- feat: **Detach** action on per-session menu — removes the session from `sessions.json` and unmounts its tab, while the tmux session itself keeps running. Re-attach any time from "Open Session…".
- feat: new `PATCH /api/sessions` actions `attach` / `detach` for the curated-set lifecycle; new `addSavedSession()` helper in `src/lib/sessions.ts`.
- feat: every session now carries a `createdAt` epoch alongside the display-friendly `created` string, so the sidebar can sort newest-first without re-parsing locale strings.

## [1.5.0] - 2026-04-08

### Features

- feat: session recovery — persist all active tmux/Claude sessions to `~/.wormhole/sessions.json` and restore them on page load like Chrome tabs
- feat: new `src/lib/sessions.ts` persistence layer — read/write/sync/remove/rename/resurrect with a single-writer model (server-side only)
- feat: 1-minute server-side session sync interval (`server.ts`)
- feat: `GET /api/sessions` merges live sessions with the saved file and auto-resurrects dead-but-recently-seen ones via `cld --resume`
- feat: `DELETE` and `PATCH /api/sessions` handlers update `sessions.json` (remove on kill, rename key)
- feat: auto-open saved tabs on page load with `?session=X` URL param precedence
- feat: `restoring` state in `TerminalView` — shows a "Restoring session..." indicator and polls `claudeState` before opening the WebSocket, so the terminal doesn't attach to a half-started Claude

### Bug Fixes

- fix: recover from WebGL context loss and refresh on visibility change (#54)
- fix: poll for `claudeState` before connecting restored-session WebSocket (avoids blank pane races)
- fix: review round — `workingDir` validation, `claudeSessionId` injection guard, in-memory resurrection mutex, safer JSON serialization

### Chores

- chore: remove `tmux-resurrect` + `tmux-continuum` plugins from `scripts/tmux.conf` — session persistence is now owned by claude-wormhole itself, and the plugins were restoring dead `detached-run-claude-*` husks as interactive `cld` shells

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


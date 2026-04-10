'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionList } from '@/components/SessionList';
import { useViewport } from '@/hooks/useViewport';
import { toggleFullscreen } from '@/lib/viewport';
import { version as PKG_VERSION } from '../../package.json';

interface SidebarProps {
  theme: string;
  toggleTheme: () => void;
  showIOSHint: () => void;
  refreshKey: number;
  setRefreshKey: (fn: (k: number) => number) => void;
  openTabs: string[];
  activeTab: string | null;
  onAttach: (name: string) => void;
  onDetach: (name: string) => void;
  onNewSession: (dir?: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onKill: (name: string) => void;
}

// A compact view of a detached tmux session — what we show in the
// "Open session..." flyout list. Matches the shape of what /api/sessions
// returns, minus the fields we don't need here.
interface DetachedSession {
  name: string;
  workingDir: string;
  claudeState: 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;
}

function formatTrashAge(trashedAt: number): string {
  const diff = Math.floor(Date.now() / 1000) - trashedAt;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function Sidebar({
  theme,
  toggleTheme,
  showIOSHint,
  refreshKey,
  setRefreshKey,
  openTabs,
  activeTab,
  onAttach,
  onDetach,
  onNewSession,
  onRename,
  onKill,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The ⋮ dropdown has two views: the main menu (New / Restart / Theme / ...)
  // and an "Open detached session" flyout listing sessions live in tmux but
  // not currently attached as tabs. Toggle via setMenuView.
  const [menuView, setMenuView] = useState<'main' | 'detached' | 'trash'>('main');
  const [detachedSessions, setDetachedSessions] = useState<DetachedSession[]>([]);
  const [detachedLoading, setDetachedLoading] = useState(false);

  // Trash (killed sessions available for recovery)
  interface TrashedSession {
    tmuxName: string;
    workingDir: string;
    claudeSessionId: string | null;
    trashedAt: number;
  }
  const [trashedSessions, setTrashedSessions] = useState<TrashedSession[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isIOS, isPWA, isFullscreen } = useViewport();

  // Close menu on outside click or Escape. Always reset to 'main' view on
  // close so the next open starts fresh.
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMenuView('main');
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape from sub-views returns to main menu; escape from main
        // menu closes the whole dropdown.
        if (menuView === 'detached' || menuView === 'trash') {
          setMenuView('main');
        } else {
          setMenuOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen, menuView]);

  // Fetch detached sessions whenever the user opens the "Open session..."
  // flyout. We fetch fresh each time rather than keeping it polled — this
  // list is opened rarely, so a one-shot fetch is cheaper than a polling
  // subscription, and it avoids stale data (e.g. the user killed a session
  // externally five minutes ago — we'd show it as attachable incorrectly).
  const openDetachedView = useCallback(async () => {
    setMenuView('detached');
    setDetachedLoading(true);
    try {
      const res = await fetch('/api/sessions');
      const all: DetachedSession[] = await res.json();
      const openSet = new Set(openTabs);
      // Detached = live tmux session the user hasn't attached as a tab
      const detached = all.filter((s) => !openSet.has(s.name));
      // Sort alphabetically, case-insensitive, for a stable UX
      detached.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
      setDetachedSessions(detached);
    } catch {
      setDetachedSessions([]);
    } finally {
      setDetachedLoading(false);
    }
  }, [openTabs]);

  const attachDetached = useCallback(
    (name: string) => {
      onAttach(name);
      setMenuOpen(false);
      setMenuView('main');
    },
    [onAttach],
  );

  // Fetch trashed (killed) sessions for recovery picker
  const openTrashView = useCallback(async () => {
    setMenuView('trash');
    setTrashLoading(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trash' }),
      });
      const data: TrashedSession[] = await res.json();
      // Sort newest-trashed first
      data.sort((a, b) => b.trashedAt - a.trashedAt);
      setTrashedSessions(data);
    } catch {
      setTrashedSessions([]);
    } finally {
      setTrashLoading(false);
    }
  }, []);

  const restoreFromTrash = useCallback(
    async (tmuxName: string) => {
      try {
        await fetch('/api/sessions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', name: tmuxName }),
        });
        // Attach the restored session as a tab
        onAttach(tmuxName);
        setMenuOpen(false);
        setMenuView('main');
        setRefreshKey((k) => k + 1);
      } catch {
        // silent
      }
    },
    [onAttach, setRefreshKey],
  );

  const restartAll = useCallback(async () => {
    setMenuOpen(false);
    try {
      const res = await fetch('/api/sessions');
      const sessions: { name: string }[] = await res.json();
      await Promise.allSettled(
        sessions.map((s) =>
          fetch('/api/sessions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart', name: s.name }),
          })
        )
      );
      setRefreshKey((k) => k + 1);
    } catch {
      // silent
    }
  }, [setRefreshKey]);

  return (
    <>
      {/* Header: logo + menu */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <h1 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 512 512" fill="none">
            <circle cx="256" cy="256" r="200" stroke="#da7756" strokeWidth="28" fill="none" opacity="0.3"/>
            <circle cx="256" cy="256" r="145" stroke="#da7756" strokeWidth="24" fill="none" opacity="0.5"/>
            <circle cx="256" cy="256" r="95" stroke="#da7756" strokeWidth="20" fill="none" opacity="0.7"/>
            <circle cx="256" cy="256" r="50" stroke="#da7756" strokeWidth="18" fill="none" opacity="0.9"/>
            <circle cx="256" cy="256" r="18" fill="#e8956d"/>
            <path d="M256,56 Q380,140 380,256 Q380,370 256,400 Q130,370 130,256 Q130,180 200,140" stroke="#c4644a" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.6"/>
            <path d="M256,456 Q132,372 132,256 Q132,142 256,112 Q382,142 382,256 Q382,332 312,372" stroke="#c4644a" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.6"/>
          </svg>
          claude-wormhole
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNewSession()}
            className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
            title="New session"
          >
            +
          </button>
          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 text-muted hover:text-primary rounded transition-colors"
              title="Menu"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
            {menuOpen && menuView === 'main' && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm">
                <button
                  onClick={() => { setMenuOpen(false); onNewSession(); }}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                >
                  New Session
                </button>
                <button
                  onClick={openDetachedView}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors flex items-center justify-between"
                >
                  <span>Attach Session…</span>
                  <span className="text-muted">›</span>
                </button>
                <button
                  onClick={openTrashView}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors flex items-center justify-between"
                >
                  <span>Restore Session…</span>
                  <span className="text-muted">›</span>
                </button>
                <button
                  onClick={restartAll}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                >
                  Restart All
                </button>

                <div className="border-t border-border my-1" />

                <button
                  onClick={() => { setMenuOpen(false); toggleTheme(); }}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                >
                  {theme === 'dark' ? '☀ Light Mode' : '☾ Dark Mode'}
                </button>
                {isIOS && !isPWA ? (
                  <button
                    onClick={() => { setMenuOpen(false); showIOSHint(); }}
                    className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                  >
                    Install PWA
                  </button>
                ) : !isPWA ? (
                  <button
                    onClick={() => { setMenuOpen(false); toggleFullscreen(); }}
                    className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                  >
                    {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  </button>
                ) : null}
                <button
                  onClick={() => { setMenuOpen(false); window.location.reload(); }}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                >
                  Reload
                </button>

                <div className="border-t border-border my-1" />

                <div className="px-3 py-1.5 text-[10px] text-muted font-mono">
                  v{PKG_VERSION} · b{process.env.NEXT_PUBLIC_BUILD_VERSION?.slice(-6) ?? '?'}
                </div>
              </div>
            )}
            {menuOpen && menuView === 'detached' && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm max-h-[70vh] overflow-y-auto">
                {/* Header: back button + title */}
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
                  <button
                    onClick={() => setMenuView('main')}
                    className="text-muted hover:text-primary px-1 py-0.5 rounded transition-colors"
                    title="Back to menu"
                  >
                    ‹
                  </button>
                  <span className="text-xs font-mono text-muted">Detached sessions</span>
                </div>

                {detachedLoading ? (
                  <div className="px-3 py-3 text-xs text-muted">Loading…</div>
                ) : detachedSessions.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted">
                    No detached sessions. Every live tmux session is already attached as a tab.
                  </div>
                ) : (
                  detachedSessions.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => attachDetached(s.name)}
                      className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] truncate flex-1">{s.name}</span>
                        {s.claudeState === 'busy' && (
                          <span className="text-[10px] text-blue-400 shrink-0">working</span>
                        )}
                        {s.claudeState === 'waiting' && (
                          <span className="text-[10px] text-amber-400 shrink-0">input</span>
                        )}
                        {s.claudeState === 'idle' && (
                          <span className="text-[10px] text-green-400 shrink-0">idle</span>
                        )}
                      </div>
                      {s.workingDir && (
                        <div className="text-[11px] text-muted font-mono truncate mt-0.5">
                          {s.workingDir.replace(/^\/Users\/[^/]+/, '~')}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {menuOpen && menuView === 'trash' && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm max-h-[70vh] overflow-y-auto">
                {/* Header: back button + title */}
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
                  <button
                    onClick={() => setMenuView('main')}
                    className="text-muted hover:text-primary px-1 py-0.5 rounded transition-colors"
                    title="Back to menu"
                  >
                    ‹
                  </button>
                  <span className="text-xs font-mono text-muted">Killed sessions</span>
                </div>

                {trashLoading ? (
                  <div className="px-3 py-3 text-xs text-muted">Loading…</div>
                ) : trashedSessions.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted">
                    No killed sessions to restore.
                  </div>
                ) : (
                  trashedSessions.map((s) => (
                    <button
                      key={`${s.tmuxName}-${s.trashedAt}`}
                      onClick={() => restoreFromTrash(s.tmuxName)}
                      className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] truncate flex-1">{s.tmuxName}</span>
                        <span className="text-[10px] text-muted shrink-0">
                          {formatTrashAge(s.trashedAt)}
                        </span>
                      </div>
                      {s.workingDir && (
                        <div className="text-[11px] text-muted font-mono truncate mt-0.5">
                          {s.workingDir.replace(/^\/Users\/[^/]+/, '~')}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        <SessionList
          refreshKey={refreshKey}
          openTabs={openTabs}
          activeTab={activeTab}
          onAttach={onAttach}
          onDetach={onDetach}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          onNewInDir={(dir) => onNewSession(dir)}
          onRename={onRename}
          onKill={onKill}
        />
      </div>
    </>
  );
}

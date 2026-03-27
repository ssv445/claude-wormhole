'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionList } from '@/components/SessionList';
import { useViewport } from '@/hooks/useViewport';
import { toggleFullscreen } from '@/lib/viewport';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const { isIOS, isPWA, isFullscreen } = useViewport();

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

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
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm">
                <button
                  onClick={() => { setMenuOpen(false); onNewSession(); }}
                  className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-hover transition-colors"
                >
                  New Session
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
                  v1.0.0 · b{process.env.NEXT_PUBLIC_BUILD_VERSION?.slice(-6) ?? '?'}
                </div>
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

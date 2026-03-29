'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionList } from '@/components/SessionList';
import { TerminalView } from '@/components/TerminalView';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { Sidebar } from '@/components/Sidebar';
import { useTheme } from '@/lib/theme';
import { initViewport } from '@/lib/viewport';
import { useViewport } from '@/hooks/useViewport';

// Initialize viewport monitor — sets up listeners and CSS vars
if (typeof window !== 'undefined') {
  initViewport();
}

// Close push notifications — all, or just for a specific session
async function clearNotifications(session?: string) {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  const notifications = await reg.getNotifications();
  for (const n of notifications) {
    if (!session || n.data?.session === session) {
      n.close();
    }
  }
}

export default function Home() {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newSessionDir, setNewSessionDir] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { theme, toggle: toggleTheme } = useTheme();
  const viewport = useViewport();
  const [showIOSHint, setShowIOSHint] = useState(false);

  // Pull-to-refresh for mobile session list
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const pullContainerRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 60;

  const onPullTouchStart = useCallback((e: React.TouchEvent) => {
    const el = pullContainerRef.current;
    // Only activate when scrolled to top
    if (el && el.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
    } else {
      pullStartY.current = -1;
    }
  }, []);

  const onPullTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current < 0 || refreshing) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      // Dampen the pull distance for a rubber-band feel
      setPullDistance(Math.min(dy * 0.4, 80));
    }
  }, [refreshing]);

  const onPullTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setRefreshKey((k) => k + 1);
      // Hold the spinner briefly so the user sees it
      setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, 600);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing]);

  // Left-edge swipe to open sidebar (mobile only)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    const EDGE_WIDTH = 30; // px from left edge to trigger
    const MIN_SWIPE = 50;  // px horizontal distance to count as swipe

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (touch.clientX <= EDGE_WIDTH) {
        startX = touch.clientX;
        startY = touch.clientY;
      } else {
        startX = -1; // not an edge swipe
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (startX < 0) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      // Horizontal swipe right, not too vertical
      if (dx > MIN_SWIPE && dx > dy) {
        setSidebarOpen(true);
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Sync URL → session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) {
      setOpenTabs((prev) => (prev.includes(session) ? prev : [...prev, session]));
      setActiveTab(session);
    }
  }, []);

  // Sync session → URL when activeTab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab) {
      params.set('session', activeTab);
    } else {
      params.delete('session');
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    history.replaceState(null, '', newUrl);
  }, [activeTab]);

  const attachSession = useCallback((name: string) => {
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveTab(name);
    setSidebarOpen(false);
    clearNotifications(name);
  }, []);

  // Clear all notifications when app comes to foreground
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') clearNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Listen for service worker messages (notification tap → open session)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-session' && event.data.session) {
        attachSession(event.data.session);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [attachSession]);

  const renameSession = useCallback((oldName: string, newName: string) => {
    setOpenTabs((prev) => prev.map((t) => (t === oldName ? newName : t)));
    setActiveTab((prev) => (prev === oldName ? newName : prev));
  }, []);

  const detachSession = useCallback((name: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== name);
      setActiveTab((current) => {
        if (current !== name) return current;
        return next.length > 0 ? next[next.length - 1] : null;
      });
      return next;
    });
  }, []);

  const killSession = useCallback(async (name: string) => {
    try {
      await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      detachSession(name);
      setRefreshKey((k) => k + 1);
    } catch { /* silent */ }
  }, [detachSession]);

  // Sidebar content — shared between mobile drawer and desktop pinned sidebar
  const sidebar = (
    <Sidebar
      theme={theme}
      toggleTheme={toggleTheme}
      showIOSHint={() => setShowIOSHint(true)}
      refreshKey={refreshKey}
      setRefreshKey={setRefreshKey}
      openTabs={openTabs}
      activeTab={activeTab}
      onAttach={attachSession}
      onDetach={detachSession}
      onNewSession={(dir) => { if (dir) setNewSessionDir(dir); setShowNewDialog(true); }}
      onRename={renameSession}
      onKill={killSession}
    />
  );

  return (
    <div className="fixed inset-0 flex bg-surface-alt">
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex md:flex-col md:w-56 md:shrink-0 bg-surface border-r border-border">
        {sidebar}
      </div>

      {/* Mobile slide-out drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />
          {/* Drawer panel */}
          <div
            className="absolute inset-y-0 left-0 w-64 bg-surface border-r border-border flex flex-col"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'var(--safe-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* Main area — height driven by --vh CSS var (shrinks when keyboard opens) */}
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{ height: 'var(--vh, 100dvh)' }}
      >
        {/* Mobile top bar — compact: hamburger + session name + actions */}
        <div className="flex items-center bg-surface border-b border-border shrink-0 md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-2 py-1.5 text-secondary hover:text-primary text-base shrink-0 transition-colors"
            title="Sessions"
          >
            {'\u2630'}
          </button>
          <div className="flex-1 min-w-0 px-1">
            {activeTab ? (
              <span className="text-xs font-mono truncate block">{activeTab}</span>
            ) : (
              <span className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 512 512" fill="none">
                  <circle cx="256" cy="256" r="200" stroke="#da7756" strokeWidth="28" fill="none" opacity="0.3"/>
                  <circle cx="256" cy="256" r="145" stroke="#da7756" strokeWidth="24" fill="none" opacity="0.5"/>
                  <circle cx="256" cy="256" r="95" stroke="#da7756" strokeWidth="20" fill="none" opacity="0.7"/>
                  <circle cx="256" cy="256" r="50" stroke="#da7756" strokeWidth="18" fill="none" opacity="0.9"/>
                  <circle cx="256" cy="256" r="18" fill="#e8956d"/>
                  <path d="M256,56 Q380,140 380,256 Q380,370 256,400 Q130,370 130,256 Q130,180 200,140" stroke="#c4644a" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.6"/>
                  <path d="M256,456 Q132,372 132,256 Q132,142 256,112 Q382,142 382,256 Q382,332 312,372" stroke="#c4644a" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.6"/>
                </svg>
                claude-wormhole
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 mr-1">
            {openTabs.length > 1 && (
              <span className="text-xs text-muted">{openTabs.length} tabs</span>
            )}
            {activeTab && (
              <button
                onClick={() => window.location.reload()}
                className="p-1.5 text-muted hover:text-primary transition-colors"
                title="Reload session"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content: terminal or empty state */}
        {activeTab ? (
          openTabs.map((name) => (
            <TerminalView
              key={name}
              session={name}
              visible={name === activeTab}
              theme={theme}
              onDisconnect={() => detachSession(name)}
            />
          ))
        ) : (
          <div
            ref={pullContainerRef}
            className="flex-1 overflow-y-auto p-4 md:flex md:items-center md:justify-center"
            onTouchStart={onPullTouchStart}
            onTouchMove={onPullTouchMove}
            onTouchEnd={onPullTouchEnd}
          >
            {/* Pull-to-refresh indicator (mobile only) */}
            {pullDistance > 0 && (
              <div
                className="flex justify-center md:hidden"
                style={{ height: pullDistance, transition: refreshing ? 'none' : 'height 0.1s' }}
              >
                <svg
                  className={`w-5 h-5 text-muted ${refreshing ? 'animate-spin' : ''}`}
                  style={{ opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            )}
            <div className="max-w-md mx-auto md:text-center">
              <p className="text-muted text-sm hidden md:block">Select a session from the sidebar to attach.</p>
              {/* Mobile: show inline session list when no tabs open */}
              <div className="md:hidden">
                <SessionList
                  refreshKey={refreshKey}
                  openTabs={openTabs}
                  activeTab={activeTab}
                  onAttach={attachSession}
                  onDetach={detachSession}
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                  onNewInDir={(dir) => { setNewSessionDir(dir); setShowNewDialog(true); }}
                  onRename={renameSession}
                  onKill={killSession}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewDialog && (
        <NewSessionDialog
          initialDir={newSessionDir}
          onClose={() => { setShowNewDialog(false); setNewSessionDir(''); }}
          onCreated={(name) => {
            setShowNewDialog(false);
            setNewSessionDir('');
            setRefreshKey((k) => k + 1);
            attachSession(name);
          }}
        />
      )}

      {/* iOS fullscreen hint */}
      {showIOSHint && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          onClick={() => setShowIOSHint(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-surface rounded-xl p-4 max-w-sm text-center border border-border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium mb-2">Add to Home Screen</p>
            <p className="text-xs text-muted mb-3">
              Tap the share button <span className="inline-block align-middle">&#x2191;</span> in Safari, then &quot;Add to Home Screen&quot; for a fullscreen experience.
            </p>
            <button
              onClick={() => setShowIOSHint(false)}
              className="px-4 py-1.5 bg-surface-hover rounded text-xs font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

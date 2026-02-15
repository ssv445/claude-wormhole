'use client';

import { useState, useCallback, useEffect } from 'react';
import { SessionList } from '@/components/SessionList';
import { TerminalView } from '@/components/TerminalView';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { useTheme } from '@/lib/theme';

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // iOS doesn't support Fullscreen API — detect PWA mode instead
  const [isIOS, setIsIOS] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);
    // standalone = already running as PWA (added to home screen)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);
    setIsPWA(standalone);

    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return { isFullscreen, toggle, isIOS, isPWA };
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
  const { isFullscreen, toggle: toggleFullscreen, isIOS, isPWA } = useFullscreen();
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [nativeKeyboardHeight, setNativeKeyboardHeight] = useState(0);

  // Detect native mobile keyboard via visualViewport — shrink entire app container
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onResize() {
      setNativeKeyboardHeight(Math.max(0, Math.round(window.innerHeight - vv!.height)));
    }
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
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

  // Sidebar content — shared between mobile drawer and desktop pinned sidebar
  const sidebar = (
    <>
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
          {/* Fullscreen: native API on desktop, PWA hint on iOS */}
          {isIOS && !isPWA ? (
            <button
              onClick={() => setShowIOSHint(true)}
              className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
              title="Add to Home Screen for fullscreen"
            >
              {'\u26F6'}
            </button>
          ) : !isPWA ? (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? '\u2716' : '\u26F6'}
            </button>
          ) : null}
          {activeTab && (
            <button
              onClick={() => window.location.reload()}
              className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
              title="Reload session"
            >
              {'\u21BB'}
            </button>
          )}
          <button
            onClick={() => setShowNewDialog(true)}
            className="p-1.5 text-muted hover:text-primary text-sm transition-colors"
            title="New session"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        <div className="px-2 pb-2 text-xs font-medium text-muted uppercase tracking-wider">
          Sessions
        </div>
        <SessionList
          refreshKey={refreshKey}
          openTabs={openTabs}
          activeTab={activeTab}
          onAttach={attachSession}
          onDetach={detachSession}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          onNewInDir={(dir) => { setNewSessionDir(dir); setShowNewDialog(true); }}
          onRename={renameSession}
        />
      </div>
      {/* Build version — tap to force reload */}
      <button
        onClick={() => window.location.reload()}
        className="w-full px-4 py-2 border-t border-border text-[10px] text-muted font-mono text-left hover:text-secondary transition-colors"
        title="Force reload"
      >
        v1.0.0 · {process.env.NEXT_PUBLIC_GIT_HASH ?? 'dev'} ↻
      </button>
    </>
  );

  return (
    <div className="h-dvh flex">
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
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — hamburger + active tab name only */}
        <div className="flex items-center bg-surface border-b border-border shrink-0 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-2.5 py-2 text-secondary hover:text-primary text-lg shrink-0 transition-colors"
            title="Sessions"
          >
            {'\u2630'}
          </button>
          <div className="flex-1 min-w-0 px-1">
            {activeTab ? (
              <span className="text-sm font-mono truncate block">{activeTab}</span>
            ) : (
              <span className="text-sm font-bold tracking-tight flex items-center gap-1.5">
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
              nativeKeyboardHeight={nativeKeyboardHeight}
              onDisconnect={() => detachSession(name)}
            />
          ))
        ) : (
          <div className="flex-1 overflow-y-auto p-4 md:flex md:items-center md:justify-center">
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
                  onRename={renameSession}
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
            className="relative bg-surface border border-border rounded-xl p-4 max-w-sm w-full mb-8 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium mb-2">Fullscreen on iOS</p>
            <p className="text-sm text-secondary mb-3">
              Tap the share button, then &ldquo;Add to Home Screen&rdquo; to open without browser chrome.
            </p>
            <button
              onClick={() => setShowIOSHint(false)}
              className="px-4 py-2 bg-surface-hover rounded-md text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

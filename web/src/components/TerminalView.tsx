'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { XTERM_THEMES, type Theme } from '@/lib/theme';
import '@xterm/xterm/css/xterm.css';

// Mobile key shortcuts organized by function (Claude Code optimized)
const KEYBOARD_SECTIONS = [
  {
    title: 'Quick Access',
    keys: [
      { label: 'Esc', key: '\x1b', desc: 'Escape/Cancel' },
      { label: 'Tab', key: '\t', desc: 'Tab/Autocomplete' },
      { label: 'S+Tab', key: '\x1b[Z', desc: 'Toggle mode' },
      { label: '^C', key: '\x03', desc: 'Interrupt' },
      { label: '^D', key: '\x04', desc: 'Exit session' },
      { label: '^L', key: '\x0c', desc: 'Clear screen' },
      { label: '^R', key: '\x12', desc: 'History search' },
    ],
  },
  {
    title: 'Line Edit',
    keys: [
      { label: '^A', key: '\x01', desc: 'Line start' },
      { label: '^E', key: '\x05', desc: 'Line end' },
      { label: '^K', key: '\x0b', desc: 'Kill to end' },
      { label: '^U', key: '\x15', desc: 'Kill to start' },
      { label: '^W', key: '\x17', desc: 'Kill word' },
      { label: '^Y', key: '\x19', desc: 'Paste killed' },
    ],
  },
  {
    title: 'Claude Code',
    keys: [
      { label: '^G', key: '\x07', desc: 'Open editor' },
      { label: '^O', key: '\x0f', desc: 'Verbose mode' },
      { label: '^B', key: '\x02', desc: 'Background task' },
      { label: '^T', key: '\x14', desc: 'Toggle tasks' },
      { label: '^J', key: '\x0a', desc: 'New line' },
    ],
  },
  {
    title: 'Navigate',
    keys: [
      { label: '\u2190', key: '\x1b[D', desc: 'Left' },
      { label: '\u2192', key: '\x1b[C', desc: 'Right' },
      { label: '\u2191', key: '\x1b[A', desc: 'Up' },
      { label: '\u2193', key: '\x1b[B', desc: 'Down' },
      { label: 'Home', key: '\x1b[H', desc: 'Home' },
      { label: 'End', key: '\x1b[F', desc: 'End' },
    ],
  },
  {
    title: 'Page',
    keys: [
      { label: 'PgUp', key: '\x1b[5~', desc: 'Page up' },
      { label: 'PgDn', key: '\x1b[6~', desc: 'Page down' },
      { label: 'Del', key: '\x1b[3~', desc: 'Delete' },
      { label: 'Ins', key: '\x1b[2~', desc: 'Insert' },
    ],
  },
  {
    title: 'Alt Keys',
    keys: [
      { label: 'Alt+B', key: '\x1bb', desc: 'Back word' },
      { label: 'Alt+F', key: '\x1bf', desc: 'Forward word' },
      { label: 'Alt+Y', key: '\x1by', desc: 'Paste cycle' },
      { label: 'Alt+P', key: '\x1bp', desc: 'Switch model' },
      { label: 'Alt+M', key: '\x1bm', desc: 'Toggle mode' },
      { label: 'Alt+T', key: '\x1bt', desc: 'Toggle think' },
    ],
  },
  {
    title: 'Symbols',
    keys: [
      { label: '/', key: '/', desc: 'Command' },
      { label: '!', key: '!', desc: 'Bash mode' },
      { label: '@', key: '@', desc: 'File mention' },
      { label: '|', key: '|', desc: 'Pipe' },
      { label: '~', key: '~', desc: 'Tilde' },
      { label: '-', key: '-', desc: 'Dash' },
    ],
  },
];

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;

const isMobile = () =>
  typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function TerminalView({
  session,
  visible,
  theme,
  onDisconnect,
}: {
  session: string;
  visible: boolean;
  theme: Theme;
  onDisconnect: () => void;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const searchAddonRef = useRef<import('@xterm/addon-search').SearchAddon | null>(null);

  // Prevent double-paste: both paste event and onData fire when pasting
  const isPastingRef = useRef(false);

  // Reconnection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  // Keyboard state
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<{ copy?: string; paste?: string }>({});

  // Search state
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Scroll-to-bottom tracking
  const [isAtBottom, setIsAtBottom] = useState(true);

  const sendKey = useCallback((key: string) => {
    wsRef.current?.send(key);
  }, []);

  const handleCopy = useCallback(async () => {
    const selection = xtermRef.current?.getSelection();
    if (!selection) {
      setClipboardStatus({ copy: 'No selection' });
      setTimeout(() => setClipboardStatus((s) => ({ ...s, copy: undefined })), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(selection);
      setClipboardStatus({ copy: 'Copied!' });
    } catch {
      setClipboardStatus({ copy: 'Failed' });
    }
    setTimeout(() => setClipboardStatus((s) => ({ ...s, copy: undefined })), 1500);
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text);
        setClipboardStatus({ paste: 'Pasted!' });
      } else {
        setClipboardStatus({ paste: 'Empty' });
      }
    } catch {
      setClipboardStatus({ paste: 'Failed' });
    }
    setTimeout(() => setClipboardStatus((s) => ({ ...s, paste: undefined })), 1500);
  }, []);

  // Search handlers
  const openSearch = useCallback(() => {
    setSearchVisible(true);
    // Focus the input after React renders it
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery('');
    searchAddonRef.current?.clearDecorations();
    xtermRef.current?.focus();
  }, []);

  const findNext = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findNext(searchQuery, { regex: false, caseSensitive: false, incremental: true });
    }
  }, [searchQuery]);

  const findPrevious = useCallback(() => {
    if (searchQuery && searchAddonRef.current) {
      searchAddonRef.current.findPrevious(searchQuery, { regex: false, caseSensitive: false, incremental: true });
    }
  }, [searchQuery]);

  // Auto-search as user types
  useEffect(() => {
    if (searchVisible && searchQuery) findNext();
  }, [searchQuery, searchVisible, findNext]);

  // Blur terminal when virtual keyboard is shown to prevent mobile keyboard
  // and refit terminal when keyboard visibility changes
  useEffect(() => {
    if (keyboardVisible && xtermRef.current) {
      xtermRef.current.blur();
    }
    // Refit terminal to new container size
    if (fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [keyboardVisible]);

  // Update xterm theme when theme prop changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = XTERM_THEMES[theme];
    }
  }, [theme]);

  // Re-fit when becoming visible (double-fit for stale computed styles)
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        // Second fit after layout settles — handles stale getComputedStyle
        setTimeout(() => fitAddonRef.current?.fit(), 50);
      });
    }
  }, [visible]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    intentionalCloseRef.current = false;

    function connectWebSocket(term: import('@xterm/xterm').Terminal) {
      if (disposed || intentionalCloseRef.current) return;

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${location.host}/api/terminal?session=${encodeURIComponent(session)}`
      );
      wsRef.current = ws;
      setConnectionState('connecting');

      ws.onopen = () => {
        setConnectionState('connected');
        setReconnectAttempt(0);
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onclose = () => {
        if (intentionalCloseRef.current || disposed) return;
        scheduleReconnect(term);
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect handled there
      };
    }

    function scheduleReconnect(term: import('@xterm/xterm').Terminal) {
      setConnectionState((prev) => {
        // Don't overwrite 'failed' with 'reconnecting'
        if (prev === 'failed') return prev;
        return 'reconnecting';
      });

      setReconnectAttempt((attempt) => {
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          setConnectionState('failed');
          return attempt;
        }
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket(term);
        }, delay);
        return attempt + 1;
      });
    }

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');
      const { SearchAddon } = await import('@xterm/addon-search');
      // CanvasAddon: GPU-accelerated rendering, must load after term.open()
      const { CanvasAddon } = await import('@xterm/addon-canvas');

      if (disposed || !termRef.current) return;

      const mobile = isMobile();
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorWidth: 2,
        fontSize: mobile ? 11 : 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontWeight: '400',
        fontWeightBold: '600',
        lineHeight: mobile ? 1.15 : 1.2,
        scrollback: 15000,
        scrollSensitivity: mobile ? 3 : 1,
        fastScrollSensitivity: 5,
        fastScrollModifier: 'alt',
        smoothScrollDuration: 100,
        allowProposedApi: true,
        theme: XTERM_THEMES[theme],
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(searchAddon);

      // Open terminal, then load CanvasAddon (needs DOM to exist)
      term.open(termRef.current);
      try {
        term.loadAddon(new CanvasAddon());
      } catch {
        // CanvasAddon can fail on some devices — fall back to default renderer
      }
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // Cmd/Ctrl+C: copy when text is selected, otherwise send SIGINT
      term.attachCustomKeyEventHandler((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'c' && event.type === 'keydown') {
          if (term.hasSelection()) {
            const selection = term.getSelection();
            if (selection) navigator.clipboard.writeText(selection);
            term.clearSelection();
            return false; // prevent xterm from sending ^C
          }
        }
        // Cmd/Ctrl+Shift+F: open search
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'F' && event.type === 'keydown') {
          // setState inside a keyhandler — defer to avoid React batching issues
          setTimeout(() => {
            setSearchVisible(true);
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }, 0);
          return false;
        }
        return true;
      });

      // Prevent double-paste: intercept native paste on the terminal element
      const termElement = termRef.current;
      const pasteHandler = (e: Event) => {
        const clipboardEvent = e as ClipboardEvent;
        const text = clipboardEvent.clipboardData?.getData('text');
        if (text && wsRef.current?.readyState === WebSocket.OPEN) {
          e.preventDefault();
          isPastingRef.current = true;
          wsRef.current.send(text);
          setTimeout(() => { isPastingRef.current = false; }, 50);
        }
      };
      termElement?.addEventListener('paste', pasteHandler);

      // Send input to WebSocket, skip if paste already handled it
      term.onData((data) => {
        if (isPastingRef.current) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
        }
      });

      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

      // Track scroll position for scroll-to-bottom button
      term.onScroll(() => {
        const buffer = term.buffer.active;
        setIsAtBottom(buffer.viewportY >= buffer.baseY);
      });
      // Also reset when new data arrives and user is at bottom
      term.onWriteParsed(() => {
        const buffer = term.buffer.active;
        if (buffer.viewportY >= buffer.baseY - 1) {
          setIsAtBottom(true);
        }
      });

      // Debounced resize handler with double-fit
      const handleResize = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          requestAnimationFrame(() => {
            fitAddon.fit();
            // Second fit after layout settles
            setTimeout(() => fitAddon.fit(), 50);
          });
        }, mobile ? 100 : 50);
      };

      // Multiple resize sources for thorough coverage
      window.addEventListener('resize', handleResize);

      // ResizeObserver on terminal container — catches sidebar toggle, DevTools, etc.
      if (termRef.current) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(termRef.current);
      }

      // Mobile: visual viewport resize (keyboard show/hide)
      window.visualViewport?.addEventListener('resize', handleResize);
      // Mobile: orientation changes
      screen.orientation?.addEventListener('change', handleResize);

      // Expose connect function for manual reconnect and visibilitychange
      connectRef.current = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setReconnectAttempt(0);
        connectWebSocket(term);
      };

      // Reconnect immediately when iOS PWA returns from background
      function handleVisibilityChange() {
        if (document.visibilityState === 'visible' && wsRef.current?.readyState !== WebSocket.OPEN) {
          connectRef.current?.();
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Initial connection
      connectWebSocket(term);
      term.focus();

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('resize', handleResize);
        window.visualViewport?.removeEventListener('resize', handleResize);
        screen.orientation?.removeEventListener('change', handleResize);
        resizeObserver?.disconnect();
        termElement?.removeEventListener('paste', pasteHandler);
        if (resizeTimeout) clearTimeout(resizeTimeout);
        try { term.dispose(); } catch { /* ignore if already disposed */ }
      };
    }

    const cleanup = init();

    return () => {
      disposed = true;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      cleanup.then((fn) => fn?.());
    };
    // theme intentionally excluded — handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function handleMobileKey(key: string) {
    sendKey(key);
    // Don't refocus terminal to prevent mobile keyboard from showing
    // xtermRef.current?.focus();
  }

  return (
    <div
      className="h-dvh flex flex-col"
      style={{
        display: visible ? 'flex' : 'none',
        backgroundColor: XTERM_THEMES[theme].background,
      }}
    >
      {/* Terminal + reconnect overlay */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{
          maxHeight: keyboardVisible ? 'calc(100vh - 320px)' : '100%',
        }}
      >
        {/* NO padding on terminal div — FitAddon reads offsetHeight which
            includes padding, but xterm renders inside padding box, causing
            dimension mismatch. Use md:p-2 on the wrapper if needed. */}
        <div
          ref={termRef}
          className="absolute inset-0 md:inset-2"
          onClick={() => {
            if (keyboardVisible && xtermRef.current) {
              xtermRef.current.blur();
            }
          }}
        />

        {/* Search bar */}
        {searchVisible && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-surface border border-border rounded-lg px-2 py-1.5 shadow-lg">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.shiftKey ? findPrevious() : findNext();
                }
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="Search..."
              className="bg-transparent text-sm text-primary outline-none w-48 font-mono placeholder:text-muted"
            />
            <button
              onClick={findPrevious}
              className="p-1 text-muted hover:text-primary transition-colors"
              title="Previous (Shift+Enter)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={findNext}
              className="p-1 text-muted hover:text-primary transition-colors"
              title="Next (Enter)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={closeSearch}
              className="p-1 text-muted hover:text-primary transition-colors"
              title="Close (Escape)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Scroll-to-bottom button */}
        {!isAtBottom && (
          <button
            onClick={() => xtermRef.current?.scrollToBottom()}
            className="absolute bottom-3 right-3 z-20 w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-primary shadow-lg transition-colors"
            title="Scroll to bottom"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Reconnection overlay */}
        {(connectionState === 'reconnecting' || connectionState === 'failed') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
            <div className="text-center space-y-3">
              {connectionState === 'reconnecting' ? (
                <>
                  <div className="text-yellow-400 text-lg font-mono">Reconnecting...</div>
                  <div className="text-gray-400 text-sm font-mono">
                    Attempt {reconnectAttempt} / {MAX_RECONNECT_ATTEMPTS}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-red-400 text-lg font-mono">Connection lost</div>
                  <button
                    onClick={() => connectRef.current?.()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-mono text-sm transition-colors"
                  >
                    Reconnect
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating keyboard toggle button (FAB) - Mobile only */}
      <button
        onClick={() => setKeyboardVisible(!keyboardVisible)}
        className="fixed right-4 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center z-50 md:hidden transition-all active:scale-95"
        style={{
          // Move FAB up when keyboard is visible
          bottom: keyboardVisible ? '324px' : '16px',
        }}
        title={keyboardVisible ? 'Hide keyboard' : 'Show keyboard'}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {keyboardVisible ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          )}
        </svg>
      </button>

      {/* Fixed bottom keyboard - Mobile only */}
      {keyboardVisible && (
        <div className="flex flex-col border-t border-border bg-surface shrink-0 md:hidden">
          {/* Keyboard header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs text-muted font-mono">Virtual Keyboard</span>
            <button
              onClick={() => setKeyboardVisible(false)}
              className="text-muted hover:text-primary p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Keyboard sections - scrollable container */}
          <div className="flex flex-col gap-2 px-2 py-2 overflow-y-auto max-h-72">
            {/* Clipboard section — custom handlers, not part of KEYBOARD_SECTIONS */}
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-muted font-semibold uppercase tracking-wider px-1">
                Clipboard
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleCopy}
                  title="Copy terminal selection to clipboard"
                  className="px-2.5 py-1.5 min-w-[44px] rounded text-xs font-mono shrink-0 transition-colors border border-blue-500/40 bg-input-bg hover:bg-surface-hover text-blue-400 active:bg-blue-700 active:text-white"
                >
                  {clipboardStatus.copy ?? 'Copy'}
                </button>
                <button
                  onClick={handlePaste}
                  title="Paste clipboard into terminal"
                  className="px-2.5 py-1.5 min-w-[44px] rounded text-xs font-mono shrink-0 transition-colors border border-blue-500/40 bg-input-bg hover:bg-surface-hover text-blue-400 active:bg-blue-700 active:text-white"
                >
                  {clipboardStatus.paste ?? 'Paste'}
                </button>
              </div>
            </div>

            {KEYBOARD_SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-1">
                {/* Section label */}
                <div className="text-[10px] text-muted font-semibold uppercase tracking-wider px-1">
                  {section.title}
                </div>
                {/* Section keys */}
                <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                  {section.keys.map(({ label, key, desc }) => (
                    <button
                      key={label}
                      onClick={() => handleMobileKey(key)}
                      title={desc}
                      className="px-2.5 py-1.5 min-w-[44px] rounded text-xs font-mono shrink-0 transition-colors bg-input-bg hover:bg-surface-hover text-secondary active:bg-blue-700 active:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

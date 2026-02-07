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
  const keyboardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  // Keyboard state
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardPosition, setKeyboardPosition] = useState({ x: 16, y: window.innerHeight - 200 });

  const sendKey = useCallback((key: string) => {
    wsRef.current?.send(key);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initialX: keyboardPosition.x,
      initialY: keyboardPosition.y,
    };
  }, [keyboardPosition]);

  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!dragRef.current.isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;

    setKeyboardPosition({
      x: dragRef.current.initialX + deltaX,
      y: dragRef.current.initialY + deltaY,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRef.current.isDragging = false;
  }, []);

  // Attach global drag listeners
  useEffect(() => {
    const handleMove = (e: TouchEvent | MouseEvent) => handleDragMove(e);
    const handleEnd = () => handleDragEnd();

    if (keyboardVisible) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [keyboardVisible, handleDragMove, handleDragEnd]);

  // Update xterm theme when theme prop changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = XTERM_THEMES[theme];
    }
  }, [theme]);

  // Re-fit when becoming visible
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      // Small delay to let display:none clear before measuring
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [visible]);

  useEffect(() => {
    let disposed = false;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      if (disposed || !termRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        theme: XTERM_THEMES[theme],
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(termRef.current);
      fitAddon.fit();
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // WebSocket connection
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${location.host}/api/terminal?session=${encodeURIComponent(session)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[33m[disconnected]\x1b[0m\r\n');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const onResize = () => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      };

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

      window.addEventListener('resize', onResize);
      term.focus();

      return () => {
        window.removeEventListener('resize', onResize);
        ws.close();
        term.dispose();
      };
    }

    const cleanup = init();

    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
    };
    // theme intentionally excluded — handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function handleMobileKey(key: string) {
    sendKey(key);
    xtermRef.current?.focus();
  }

  return (
    <div
      className="h-dvh flex flex-col"
      style={{
        display: visible ? 'flex' : 'none',
        backgroundColor: XTERM_THEMES[theme].background,
      }}
    >
      {/* Terminal — padded on desktop for breathing room */}
      <div ref={termRef} className="flex-1 overflow-hidden md:p-2" />

      {/* Floating keyboard toggle button (FAB) - Mobile only */}
      <button
        onClick={() => setKeyboardVisible(!keyboardVisible)}
        className="fixed bottom-4 right-4 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center z-50 md:hidden transition-transform active:scale-95"
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

      {/* Floating draggable keyboard - Mobile only */}
      {keyboardVisible && (
        <div
          ref={keyboardRef}
          className="fixed z-40 md:hidden"
          style={{
            left: `${keyboardPosition.x}px`,
            top: `${keyboardPosition.y}px`,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          {/* Drag handle */}
          <div
            className="bg-surface/95 backdrop-blur-sm border border-border rounded-t-lg px-3 py-2 cursor-move flex items-center justify-between"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-muted" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 3h2v2H9V3zm4 0h2v2h-2V3zM9 7h2v2H9V7zm4 0h2v2h-2V7zM9 11h2v2H9v-2zm4 0h2v2h-2v-2zM9 15h2v2H9v-2zm4 0h2v2h-2v-2z" />
              </svg>
              <span className="text-xs text-muted font-mono">Drag to move</span>
            </div>
            <button
              onClick={() => setKeyboardVisible(false)}
              className="text-muted hover:text-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Keyboard keys - organized by sections */}
          <div className="flex flex-col gap-2 px-2 py-2 bg-surface/95 backdrop-blur-sm border-x border-b border-border rounded-b-lg shadow-2xl">
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

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
      { label: 'S+Tab', key: '\x1b[Z', desc: 'Toggle mode' },
      { label: 'Tab', key: '\t', desc: 'Tab/Autocomplete' },
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

// iOS renders emoji-default codepoints (⏴-⏺, ✳, ❯) as colorful Apple emoji
// instead of monospace text glyphs. Appending U+FE0E (VS15) forces text presentation.
// Only active on iOS — desktop already renders these correctly.
const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const EMOJI_TEXT_RE = /[\u23F4-\u23FA\u2733\u276F]/g;
function forceTextPresentation(data: string): string {
  if (!IS_IOS) return data;
  EMOJI_TEXT_RE.lastIndex = 0;
  return EMOJI_TEXT_RE.test(data)
    ? (EMOJI_TEXT_RE.lastIndex = 0, data.replace(EMOJI_TEXT_RE, '$&\uFE0E'))
    : data;
}

// Web Speech API type declaration (not fully typed in TS)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: Event) => void) | null;
}
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    SpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;

export function TerminalView({
  session,
  visible,
  theme,
  nativeKeyboardHeight = 0,
  onDisconnect,
}: {
  session: string;
  visible: boolean;
  theme: Theme;
  nativeKeyboardHeight?: number;
  onDisconnect: () => void;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);

  // Reconnection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  // Keyboard state
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [termReady, setTermReady] = useState(false);

  // Voice input + compose overlay state
  const [isListening, setIsListening] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const composeTextRef = useRef('');
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Selection mode state (mobile long-press to select text)
  const [selectionMode, setSelectionMode] = useState(false);
  const savedMouseModeRef = useRef<string>('none');
  const selectionModeRef = useRef(false);
  const enterSelectionRef = useRef<(() => void) | null>(null);

  const sendKey = useCallback((key: string) => {
    wsRef.current?.send(key);
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text);
        return;
      }
    } catch {
      // clipboard access denied or empty — fall through
    }
    // No text in clipboard — send Ctrl+V for Claude Code's image paste
    wsRef.current?.send('\x16');
  }, []);

  const startListening = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Check and request mic permission before starting recognition
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'denied') {
        alert('Microphone permission denied. Enable it in browser settings.');
        return;
      }
    } catch {
      // permissions.query not supported (e.g. Safari) — fall through to getUserMedia
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted — stop the stream, we only needed the prompt
      stream.getTracks().forEach(t => t.stop());
    } catch {
      alert('Microphone access is required for voice input.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    speechRef.current = recognition;

    // Track the length of finalized text so we only append new finals
    let finalizedLength = 0;

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      setComposeText((prev) => {
        // Append finalized text
        const base = prev.slice(0, finalizedLength) + (finalizedLength < prev.length ? prev.slice(finalizedLength) : '');
        if (finalTranscript) {
          const separator = base.length > 0 && !base.endsWith(' ') ? ' ' : '';
          const updated = base + separator + finalTranscript;
          finalizedLength = updated.length;
          return updated;
        }
        return base;
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      speechRef.current = null;
    };

    recognition.onerror = (ev: Event & { error?: string }) => {
      setIsListening(false);
      speechRef.current = null;
      if (ev.error === 'not-allowed') {
        alert('Microphone permission denied. Enable it in browser settings.');
      }
    };

    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    speechRef.current?.stop();
    // onend handler will clean up state
  }, []);

  const openCompose = useCallback(() => {
    setShowCompose(true);
    setComposeText('');
    startListening();
    // Focus textarea after render
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [startListening]);

  const closeCompose = useCallback((send: boolean) => {
    if (isListening) stopListening();
    // Read from ref to avoid stale closure — composeText state may lag behind
    const text = composeTextRef.current;
    if (send && text.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text + '\r');
    }
    setShowCompose(false);
    setComposeText('');
  }, [isListening, stopListening]);

  // Keep refs in sync for closure access in touch handlers
  useEffect(() => { composeTextRef.current = composeText; }, [composeText]);
  useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);

  const enterSelectionMode = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    // Save current mouse tracking mode so we can restore it
    savedMouseModeRef.current = term.modes.mouseTrackingMode;
    if (savedMouseModeRef.current === 'none') return; // nothing to disable
    // Disable mouse reporting locally in xterm.js (not sent to tmux).
    // This re-enables xterm.js's built-in SelectionService.
    term.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
    setSelectionMode(true);
    selectionModeRef.current = true;
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  const exitSelectionMode = useCallback((copyFirst = false) => {
    const term = xtermRef.current;
    if (!term) return;
    if (copyFirst) {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    }
    term.clearSelection();
    // Re-enable mouse reporting with the saved mode
    const modeMap: Record<string, string> = {
      x10: '\x1b[?9h',
      vt200: '\x1b[?1000h',
      drag: '\x1b[?1002h',
      any: '\x1b[?1003h',
    };
    const decset = modeMap[savedMouseModeRef.current];
    if (decset) {
      term.write(decset + '\x1b[?1006h'); // also re-enable SGR encoding
    }
    setSelectionMode(false);
    selectionModeRef.current = false;
  }, []);

  useEffect(() => { enterSelectionRef.current = enterSelectionMode; }, [enterSelectionMode]);

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

  // Track keyboard height in a ref so ResizeObserver can read it without re-subscribing
  const nativeKbRef = useRef(nativeKeyboardHeight);
  nativeKbRef.current = nativeKeyboardHeight;

  // ResizeObserver on terminal container — fires on window resize, VK toggle
  // Skips fit() when native keyboard is open to avoid Claude Code re-render
  useEffect(() => {
    const el = termRef.current;
    if (!el || !termReady) return;
    const ro = new ResizeObserver(() => {
      if (nativeKbRef.current > 0) return; // keyboard open — skip resize
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [termReady]);

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
        term.write(forceTextPresentation(e.data));
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
      const { Unicode11Addon } = await import('@xterm/addon-unicode11');

      if (disposed || !termRef.current) return;

      // Wait for Nerd Font to load before opening terminal — xterm.js
      // canvas renderer measures char widths at open() time. If the font
      // isn't ready, measurements use a fallback font and glyphs misalign.
      await document.fonts.load('14px "JetBrains Mono NF"');

      // 10px on mobile gets ~62 cols on 390px screen (vs ~56 at 11px)
      // Claude Code status bar needs ~75 chars but 62 is the practical max
      const isMobile = window.innerWidth < 768;
      const term = new Terminal({
        cursorBlink: true,
        fontSize: isMobile ? 10 : 14,
        fontFamily: '"JetBrains Mono NF", "JetBrains Mono", monospace',
        theme: XTERM_THEMES[theme],
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      // Unicode11 gives xterm.js proper width tables for symbols like ⏺ ❯ ⏵ ✳
      // Without it, these chars render as _ because xterm can't determine their width
      const unicodeAddon = new Unicode11Addon();
      term.loadAddon(unicodeAddon);
      term.unicode.activeVersion = '11';
      term.open(termRef.current);
      fitAddon.fit();

      // GPU-accelerated rendering via WebGL2 (same renderer VS Code uses).
      // Falls back to DOM renderer if WebGL2 is unavailable (older devices).
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl');
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          // GPU context lost (system sleep, driver crash) — dispose and let DOM renderer take over
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch {
        // WebGL2 not supported — DOM renderer is the automatic fallback
      }

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      setTermReady(true);

      // Desktop copy/paste: Cmd+C/Ctrl+C copies selection (or sends SIGINT if no selection),
      // Cmd+V/Ctrl+V pastes from clipboard
      term.attachCustomKeyEventHandler((ev) => {
        const isMod = ev.metaKey || ev.ctrlKey;
        if (ev.type !== 'keydown' || !isMod) return true;

        if (ev.key === 'c') {
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel);
            term.clearSelection();
            return false; // prevent xterm from sending \x03
          }
          return true; // no selection — let \x03 (SIGINT) through
        }

        // Ctrl/Cmd+V: let browser's native paste event handle it.
        // xterm picks it up via its own paste listener → onData → WebSocket.
        // No custom handling needed (doing both causes double paste).

        return true;
      });

      // Touch handling: scroll (swipe) + long-press to enter selection mode.
      // With tmux `mouse on`, scroll sends SGR mouse wheel escape sequences.
      // Long-press (500ms hold) temporarily disables mouse reporting in xterm.js
      // so the user can select text, then re-enables on exit.
      let touchStartY = 0;
      let touchStartX = 0;
      let touchScrolling = false;
      let touchAccumulator = 0;
      const scrollSensitivity = 20; // px per scroll event
      let longPressTimer: ReturnType<typeof setTimeout> | null = null;
      const LONG_PRESS_MS = 500;
      const MOVE_THRESHOLD = 10; // px — cancel long press if finger moves

      function cancelLongPress() {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      function onTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1) return;
        // In selection mode, let xterm.js handle touches for drag-to-select
        if (selectionModeRef.current) return;

        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchScrolling = false;
        touchAccumulator = 0;

        // Start long-press timer
        cancelLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          enterSelectionRef.current?.();
        }, LONG_PRESS_MS);
      }

      function onTouchMove(e: TouchEvent) {
        if (e.touches.length !== 1) return;
        // In selection mode, let xterm.js handle touches for drag-to-select
        if (selectionModeRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const deltaY = touchStartY - e.touches[0].clientY;
        const deltaX = e.touches[0].clientX - touchStartX;

        // Cancel long-press if finger moved beyond threshold
        if (longPressTimer && (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD)) {
          cancelLongPress();
        }

        // Threshold to distinguish swipes from taps
        if (!touchScrolling && Math.abs(deltaY) < 15) return;

        // Once scrolling starts, cancel long-press
        cancelLongPress();

        if (!touchScrolling) {
          term.blur(); // dismiss iOS input accessories
        }
        touchScrolling = true;
        e.preventDefault();

        // Accumulate delta and send mouse wheel events
        touchAccumulator += deltaY;
        const events = Math.trunc(touchAccumulator / scrollSensitivity);
        if (events !== 0) {
          // SGR mouse wheel: 64 = wheel up (scroll back), 65 = wheel down (scroll forward)
          // Natural scroll: finger swipe up (positive deltaY) = scroll forward (newer content)
          const btn = events > 0 ? 65 : 64;
          const count = Math.abs(events);
          for (let i = 0; i < count; i++) {
            wsRef.current.send(`\x1b[<${btn};1;1M`);
          }
          touchAccumulator -= events * scrollSensitivity;
        }
        touchStartY = e.touches[0].clientY;
      }

      function onTouchEnd() {
        cancelLongPress();
        touchScrolling = false;
        touchAccumulator = 0;
      }

      const termContainer = termRef.current;
      termContainer.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      termContainer.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      termContainer.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });

      // Use refs so handlers always send on the latest WS
      term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
        }
      });

      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

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
        termContainer.removeEventListener('touchstart', onTouchStart, { capture: true });
        termContainer.removeEventListener('touchmove', onTouchMove, { capture: true });
        termContainer.removeEventListener('touchend', onTouchEnd, { capture: true });
        term.dispose();
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
      className="flex flex-col flex-1 min-h-0"
      style={{
        display: visible ? 'flex' : 'none',
        backgroundColor: XTERM_THEMES[theme].background,
        // Translate up when native keyboard is open — avoids terminal resize/re-render
        ...(nativeKeyboardHeight > 0 ? {
          transform: `translateY(-${nativeKeyboardHeight}px)`,
          transition: 'transform 0.1s ease-out',
        } : {
          transform: 'translateY(0)',
          transition: 'transform 0.1s ease-out',
        }),
      }}
    >
      {/* Terminal + reconnect overlay */}
      <div
        className="flex-1 overflow-hidden relative"
      >
        <div
          ref={termRef}
          className="absolute inset-0 px-1 md:p-2"
          onClick={() => {
            if (keyboardVisible && xtermRef.current) {
              xtermRef.current.blur();
            }
          }}
        />

        {/* Scroll FAB - Mobile only, 90% transparent, middle-right */}
        <div className="absolute top-1/2 -translate-y-1/2 right-2 z-10 flex flex-col gap-1 md:hidden" style={{ opacity: 0.1 }}>
          <button
            onClick={() => { sendKey('\x02['); setTimeout(() => sendKey('\x1b[5~'), 100); }}
            className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center active:opacity-100"
            title="Scroll up (tmux)"
          >
            <svg className="w-5 h-5" fill="none" stroke="black" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => sendKey('\x1b[6~')}
            className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center active:opacity-100"
            title="Scroll down (tmux)"
          >
            <svg className="w-5 h-5" fill="none" stroke="black" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Selection mode bar — shown when long-press activates selection */}
        {selectionMode && (
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-blue-600/90 backdrop-blur-sm md:hidden">
            <span className="text-white text-xs font-mono">Selection mode</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exitSelectionMode(true)}
                className="px-3 py-1 bg-white/20 rounded text-white text-xs font-mono active:bg-white/40"
              >
                Copy
              </button>
              <button
                onClick={() => exitSelectionMode(false)}
                className="px-3 py-1 bg-white/10 rounded text-white/70 text-xs font-mono active:bg-white/30"
              >
                Done
              </button>
            </div>
          </div>
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

      {/* Virtual keyboard - Mobile only */}
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

      {/* Compose overlay — slides up when mic is tapped */}
      {showCompose && (
        <div className="shrink-0 md:hidden bg-gray-800 border-t border-gray-600">
          <textarea
            ref={textareaRef}
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            placeholder="Speak or type..."
            rows={3}
            className="w-full bg-transparent text-gray-100 text-sm font-mono p-3 resize-none focus:outline-none placeholder-gray-500"
            style={{ maxHeight: '8rem' }}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            {/* Mic toggle */}
            <button
              onClick={() => isListening ? stopListening() : startListening()}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 text-gray-300'
              }`}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => closeCompose(false)}
                className="px-4 py-2 text-gray-400 text-sm font-mono active:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => closeCompose(true)}
                className="px-4 py-2 bg-blue-600 rounded text-white text-sm font-mono active:bg-blue-700"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar - Mobile only: Paste | ↑ | Keyboard | ↓ | Enter */}
      <div className="shrink-0 md:hidden h-11 bg-gray-900/90 backdrop-blur-sm border-t border-gray-700/50 flex items-center justify-around">
        {/* Escape */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); sendKey('\x1b'); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Escape"
        >
          <span className="text-xs font-mono font-bold">Esc</span>
        </button>
        {/* Paste — tries clipboard text first, falls back to Ctrl+V for image paste */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handlePaste(); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Paste (Ctrl+V)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>
        {/* Mic — opens compose overlay with voice input */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); openCompose(); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Voice input"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        {/* Exit copy-mode — sends 'q' to tmux to return to input mode */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); sendKey('q'); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Exit copy mode (back to input)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 4v16" />
            <path d="M8 4h8M8 20h8" />
          </svg>
        </button>
        {/* Arrow Up */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); sendKey('\x1b[A'); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Up arrow"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        {/* Keyboard toggle */}
        <button
          onClick={() => setKeyboardVisible(!keyboardVisible)}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title={keyboardVisible ? 'Hide keyboard' : 'Show keyboard'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            {keyboardVisible ? (
              <path d="M6 18L18 6M6 6l12 12" strokeWidth={2} />
            ) : (
              <>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2} strokeLinecap="round" />
                <path d="M7 16h10" />
              </>
            )}
          </svg>
        </button>
        {/* Arrow Down */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); sendKey('\x1b[B'); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Down arrow"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {/* Enter */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); sendKey('\r'); }}
          className="w-11 h-11 flex items-center justify-center text-gray-300 active:text-white"
          title="Enter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 01-4 4H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

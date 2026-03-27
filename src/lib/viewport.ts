// Viewport monitor — single source of truth for all viewport/device state.
// Sets CSS custom properties on :root for layout, exposes JS state via
// useSyncExternalStore-compatible API. Follows the Telegram/Ionic PWA pattern.

const KEYBOARD_THRESHOLD = 150; // px — below this delta is not a keyboard (toolbar, address bar)
const KEYBOARD_CLOSE_DELAY = 100; // ms — let Safari settle before reading closed state

// ── State ──

export interface ViewportState {
  keyboardOpen: boolean;
  keyboardHeight: number;
  availableHeight: number;
  isMobile: boolean;
  isIOS: boolean;
  isPWA: boolean;
  isFullscreen: boolean;
  orientation: 'portrait' | 'landscape';
}

// Detect once at init — these don't change at runtime
const isIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isPWA = typeof window !== 'undefined' && (
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
);

let state: ViewportState = {
  keyboardOpen: false,
  keyboardHeight: 0,
  availableHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  isIOS,
  isPWA,
  isFullscreen: false,
  orientation: typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
};

// ── Subscribers (useSyncExternalStore pattern) ──

const listeners = new Set<() => void>();

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  for (const cb of listeners) cb();
}

export function getViewport(): ViewportState {
  return state;
}

// ── CSS custom properties ──

function setCSSVars() {
  const root = document.documentElement.style;
  root.setProperty('--vh', `${state.availableHeight}px`);
  root.setProperty('--kb-height', `${state.keyboardHeight}px`);
  root.setProperty('--safe-bottom', state.keyboardOpen ? '0px' : 'env(safe-area-inset-bottom)');
}

// ── Core update logic ──

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function update() {
  const vv = window.visualViewport;
  const visualH = vv ? vv.height : window.innerHeight;
  const layoutH = window.innerHeight;
  const rawDelta = layoutH - visualH;

  // Account for browser zoom — Ionic's approach
  const scale = vv ? vv.scale : 1;
  const scaledDelta = rawDelta * scale;

  const keyboardOpen = scaledDelta > KEYBOARD_THRESHOLD;
  const keyboardHeight = keyboardOpen ? Math.round(rawDelta) : 0;

  const next: ViewportState = {
    keyboardOpen,
    keyboardHeight,
    availableHeight: Math.round(visualH),
    isMobile: window.innerWidth < 768,
    isIOS,
    isPWA,
    isFullscreen: !!document.fullscreenElement,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  };

  // If keyboard is closing, delay to let Safari settle
  if (state.keyboardOpen && !next.keyboardOpen) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      state = next;
      setCSSVars();
      notify();
    }, KEYBOARD_CLOSE_DELAY);
    return;
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  state = next;
  setCSSVars();
  notify();
}

// ── Fullscreen ──

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

// ── Init ──

let initialized = false;

export function initViewport() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  document.addEventListener('fullscreenchange', update);

  // Set initial state
  update();
}

import type { Page, Route } from '@playwright/test';
import sessionsFixture from '../fixtures/sessions.json';

/**
 * Messages captured from client → server on the mocked WebSocket.
 * Each entry is the raw string the app sent via ws.send().
 */
export type WsMessages = string[];

/**
 * Set up route mocks for /api/sessions and the WebSocket at /api/terminal.
 * Returns an array that accumulates all WS messages sent by the client.
 */
export async function setupTerminalMocks(
  page: Page,
  opts: { enableMouseTracking?: boolean } = {}
): Promise<WsMessages> {
  const { enableMouseTracking = false } = opts;
  const sent: WsMessages = [];

  // Mock /api/sessions — return fixture data
  await page.route('**/api/sessions', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionsFixture),
    });
  });

  // Mock WebSocket at /api/terminal
  // page.routeWebSocket intercepts the WS upgrade and gives us a mock server
  await page.routeWebSocket(/\/api\/terminal/, (ws) => {
    // Capture every message the client sends (only strings expected)
    ws.onMessage((msg) => {
      if (typeof msg !== 'string') {
        throw new Error(`Unexpected binary WS frame: ${Buffer.from(msg).toString('hex')}`);
      }
      sent.push(msg);
    });

    // Send a welcome banner so the terminal renders something.
    // onMessage handler fires synchronously after connection, but xterm.js
    // needs a microtask to attach its data listener — queueMicrotask bridges that gap
    // without introducing the flakiness of a fixed setTimeout.
    queueMicrotask(() => {
      if (enableMouseTracking) {
        // Enable VT200 mouse tracking + SGR encoding so xterm.js enters
        // a mouse tracking mode (required for selection mode to activate)
        ws.send('\x1b[?1000h\x1b[?1006h');
      }
      ws.send('Welcome to mock terminal\r\n$ ');
    });
  });

  return sent;
}

/**
 * Navigate to the terminal page for a given session.
 * Waits for the terminal container to be visible.
 */
export async function openTerminalSession(
  page: Page,
  sessionName = 'claude-dev'
): Promise<void> {
  await page.goto(`/?session=${sessionName}`);
  // Wait for the xterm terminal to render
  await page.waitForSelector('.xterm-screen', { timeout: 10_000 });
}

/**
 * Trigger a pointerdown event on a button (for React onPointerDown handlers).
 * Playwright's dispatchEvent creates a basic Event — we need a real PointerEvent.
 */
export async function pointerDown(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
}

/**
 * Inject WebKit-compatible touch helper functions into the page.
 * Called once per test via addInitScript — avoids duplicating makeTouch/makeTouchList
 * in every page.evaluate() call.
 */
export async function injectTouchHelpers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // WebKit doesn't support `new Touch()` constructor, so we fall back to
    // document.createTouch/createTouchList (deprecated but functional in WebKit).
    (window as any).__makeTouch = (el: Element, x: number, y: number): Touch => {
      try {
        return new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      } catch {
        return (document as any).createTouch(window, el, 1, x, y, x, y);
      }
    };

    (window as any).__makeTouchList = (...touches: Touch[]): TouchList => {
      try {
        if (typeof (document as any).createTouchList === 'function') {
          return (document as any).createTouchList(...touches);
        }
      } catch { /* fall through */ }
      // Polyfill: array-like with item() method
      const list = [...touches] as any;
      list.item = (i: number) => touches[i] || null;
      return list as TouchList;
    };
  });
}

/**
 * Get the .xterm-screen element, throwing if not found.
 * Used internally by touch dispatch helpers.
 */
function getXtermScreenScript(): string {
  return `const el = document.querySelector('.xterm-screen'); if (!el) throw new Error('Terminal .xterm-screen not found');`;
}

/**
 * Dispatch touch events using WebKit-compatible approach.
 * Requires injectTouchHelpers() to have been called (via stubBrowserAPIs).
 */
export async function dispatchTouchSequence(
  page: Page,
  opts: {
    /** Array of [clientX, clientY] pairs: first = touchstart position, rest = touchmove, last auto-generates touchend */
    points: [number, number][];
    /** Delay in ms between each move event (default 0) */
    moveDelay?: number;
  }
): Promise<void> {
  const { points, moveDelay = 0 } = opts;
  if (points.length < 1) throw new Error('Need at least 1 point');

  await page.evaluate(
    ({ pts, delay }) => {
      return new Promise<void>((resolve) => {
        const el = document.querySelector('.xterm-screen');
        if (!el) throw new Error('Terminal .xterm-screen not found');

        const makeTouch = (window as any).__makeTouch.bind(null, el);
        const makeTouchList = (window as any).__makeTouchList;

        const [startX, startY] = pts[0];
        const startTouch = makeTouch(startX, startY);

        el.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: makeTouchList(startTouch),
          targetTouches: makeTouchList(startTouch),
          changedTouches: makeTouchList(startTouch),
        }));

        let i = 1;
        function nextMove() {
          if (i >= pts.length) {
            // touchend with last position
            const [ex, ey] = pts[pts.length - 1];
            const endTouch = makeTouch(ex, ey);
            el!.dispatchEvent(new TouchEvent('touchend', {
              bubbles: true,
              cancelable: true,
              touches: makeTouchList(),
              targetTouches: makeTouchList(),
              changedTouches: makeTouchList(endTouch),
            }));
            resolve();
            return;
          }
          const [mx, my] = pts[i];
          const moveTouch = makeTouch(mx, my);
          el!.dispatchEvent(new TouchEvent('touchmove', {
            bubbles: true,
            cancelable: true,
            touches: makeTouchList(moveTouch),
            targetTouches: makeTouchList(moveTouch),
            changedTouches: makeTouchList(moveTouch),
          }));
          i++;
          if (delay > 0) {
            setTimeout(nextMove, delay);
          } else {
            nextMove();
          }
        }

        nextMove();
      });
    },
    { pts: points, delay: moveDelay }
  );
}

/**
 * Dispatch only a touchstart (for long-press testing).
 * Does NOT fire touchend — caller controls timing.
 */
export async function dispatchTouchStart(
  page: Page,
  x: number,
  y: number
): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const el = document.querySelector('.xterm-screen');
      if (!el) throw new Error('Terminal .xterm-screen not found');
      const makeTouch = (window as any).__makeTouch.bind(null, el);
      const makeTouchList = (window as any).__makeTouchList;
      const t = makeTouch(x, y);
      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true, cancelable: true,
        touches: makeTouchList(t),
        targetTouches: makeTouchList(t),
        changedTouches: makeTouchList(t),
      }));
    },
    { x, y }
  );
}

/**
 * Dispatch only a touchend.
 */
export async function dispatchTouchEnd(
  page: Page,
  x: number,
  y: number
): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const el = document.querySelector('.xterm-screen');
      if (!el) throw new Error('Terminal .xterm-screen not found');
      const makeTouch = (window as any).__makeTouch.bind(null, el);
      const makeTouchList = (window as any).__makeTouchList;
      const t = makeTouch(x, y);
      el.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, cancelable: true,
        touches: makeTouchList(),
        targetTouches: makeTouchList(),
        changedTouches: makeTouchList(t),
      }));
    },
    { x, y }
  );
}

/**
 * Dispatch a touchmove event.
 */
export async function dispatchTouchMove(
  page: Page,
  x: number,
  y: number
): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const el = document.querySelector('.xterm-screen');
      if (!el) throw new Error('Terminal .xterm-screen not found');
      const makeTouch = (window as any).__makeTouch.bind(null, el);
      const makeTouchList = (window as any).__makeTouchList;
      const t = makeTouch(x, y);
      el.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true, cancelable: true,
        touches: makeTouchList(t),
        targetTouches: makeTouchList(t),
        changedTouches: makeTouchList(t),
      }));
    },
    { x, y }
  );
}

/**
 * Wait briefly for async WS messages to arrive.
 * NOTE: Uses waitForTimeout because WS message delivery has no observable DOM side-effect
 * to wait on. Playwright docs discourage this for DOM waits, but it's appropriate for
 * async message accumulation in a mock WS.
 */
export async function waitForMessages(page: Page, ms = 200): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Clear the sent messages array (mutates in place).
 */
export function clearMessages(messages: WsMessages): void {
  messages.length = 0;
}

/**
 * Stub browser APIs that may not exist in headless: SpeechRecognition, vibrate, etc.
 * Also injects WebKit-compatible touch helpers (makeTouch/makeTouchList).
 */
export async function stubBrowserAPIs(page: Page): Promise<void> {
  // Inject touch helpers first (used by dispatchTouch* functions)
  await injectTouchHelpers(page);

  await page.addInitScript(() => {
    // Track vibrate calls
    (window as any).__vibrateCalls = [] as number[][];
    (navigator as any).vibrate = (pattern: VibratePattern) => {
      const arr = typeof pattern === 'number' ? [pattern] : [...pattern];
      (window as any).__vibrateCalls.push(arr);
      return true;
    };

    // Stub SpeechRecognition
    class MockSpeechRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onresult: ((ev: any) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((ev: any) => void) | null = null;

      start() {
        // Fire onend after a short delay to simulate recognition session
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;

    // Stub mediaDevices.getUserMedia for mic permission checks.
    // Returns a minimal MediaStream without creating an AudioContext
    // (AudioContext can fail or leak in headless environments).
    if (!navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }
    navigator.mediaDevices.getUserMedia = async () => {
      return new MediaStream();
    };
  });
}

/**
 * Get terminal center coordinates.
 */
export async function getTerminalCenter(page: Page): Promise<{ cx: number; cy: number }> {
  const terminal = page.locator('.xterm-screen');
  const box = await terminal.boundingBox();
  if (!box) throw new Error('Terminal not visible');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/**
 * Shared helpers for Safari iOS Simulator integration tests.
 * All specs interact with a real tmux session running Claude Code.
 */
import { browser, $ } from '@wdio/globals';
import { execSync } from 'child_process';

/** Deterministic session name — created in onPrepare, killed in onComplete */
export const SESSION_NAME = 'wdio-test';

/** Navigate to the terminal page for the test session */
export async function navigateToSession(): Promise<void> {
  await browser.url(`/?session=${SESSION_NAME}`);
  const screen = await $('.xterm-screen');
  await screen.waitForExist({ timeout: 15000 });
  // Wait until WebSocket delivers data (tmux pane has content)
  await browser.waitUntil(
    () => getTmuxPaneContent().trim().length > 0,
    { timeout: 10000, timeoutMsg: 'WebSocket never delivered terminal data' },
  );
}

/** Navigate to the home page, wait for React hydration and session list to load */
export async function navigateToHome(): Promise<void> {
  await browser.url('/');
  // Wait for the session list to render (API fetch completes after hydration).
  // The "Loading..." placeholder disappears once sessions are fetched.
  await browser.waitUntil(
    async () => {
      const text = await browser.execute(() => document.body.innerText);
      // Session list loaded when our test session appears OR "No sessions" shown
      return text.includes(SESSION_NAME) || text.includes('No sessions');
    },
    { timeout: 15000, timeoutMsg: 'Home page did not finish loading session list' },
  );
}

/**
 * Tap a button by its title attribute.
 * Uses W3C touch pointer actions because bottom-bar buttons use onPointerDown.
 */
export async function tapButton(title: string): Promise<void> {
  const btn = await $(`button[title="${title}"]`);
  await btn.waitForDisplayed({ timeout: 5000 });

  const location = await btn.getLocation();
  const size = await btn.getSize();
  const x = Math.round(location.x + size.width / 2);
  const y = Math.round(location.y + size.height / 2);

  await browser.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

/**
 * Swipe vertically on .xterm-screen center.
 * Positive swipeDistancePx = finger moves down the screen (scrolls up in tmux).
 * Negative = finger moves up (scrolls down in tmux).
 */
export async function swipeOnTerminal(swipeDistancePx: number, durationMs = 300): Promise<void> {
  const screen = await $('.xterm-screen');
  const location = await screen.getLocation();
  const size = await screen.getSize();
  const x = Math.round(location.x + size.width / 2);
  const startY = Math.round(location.y + size.height / 2);
  const endY = startY + swipeDistancePx;

  await browser.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: durationMs, x, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

/** Long press on terminal center */
export async function longPressOnTerminal(holdMs = 700): Promise<void> {
  const screen = await $('.xterm-screen');
  const location = await screen.getLocation();
  const size = await screen.getSize();
  const x = Math.round(location.x + size.width / 2);
  const y = Math.round(location.y + size.height / 2);

  await browser.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: holdMs },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

/**
 * Read terminal content from the tmux pane (server-side).
 * This is more reliable than trying to read from xterm.js DOM because
 * xterm uses WebGL rendering with no accessible DOM rows.
 */
export function getTmuxPaneContent(): string {
  try {
    return execSync(`tmux capture-pane -p -t ${SESSION_NAME}`, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

/**
 * Wait until tmux pane content changes from a known "before" snapshot.
 */
export async function waitForTmuxChange(
  beforeText: string,
  timeoutMs = 10000,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const current = getTmuxPaneContent();
      return current !== beforeText;
    },
    { timeout: timeoutMs, timeoutMsg: 'Terminal content did not change' },
  );
}

/**
 * Wait until tmux pane contains a specific string.
 */
export async function waitForTmuxContent(
  needle: string,
  timeoutMs = 10000,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const content = getTmuxPaneContent();
      return content.includes(needle);
    },
    { timeout: timeoutMs, timeoutMsg: `Tmux pane did not contain "${needle}"` },
  );
}

/**
 * Check if the tmux pane is in copy mode.
 * Returns true when the user has scrolled up or entered copy mode.
 */
export function isTmuxInCopyMode(): boolean {
  try {
    const result = execSync(`tmux display-message -p -t ${SESSION_NAME} '#{pane_in_mode}'`, { encoding: 'utf-8' }).trim();
    return result === '1';
  } catch {
    return false;
  }
}

/**
 * Exit tmux copy mode by sending 'q'.
 */
export function exitTmuxCopyMode(): void {
  try {
    execSync(`tmux send-keys -t ${SESSION_NAME} q`);
  } catch (e) {
    console.error('exitTmuxCopyMode failed:', e);
  }
}

/**
 * Check if a text string is visible in the page DOM.
 * Uses XPath contains() + offsetParent to confirm visibility.
 */
export async function isTextVisibleInPage(text: string): Promise<boolean> {
  return browser.execute((t: string) => {
    const el = document.evaluate(
      `//*[contains(text(),'${t}')]`,
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
    ).singleNodeValue;
    return el ? (el as HTMLElement).offsetParent !== null : false;
  }, text);
}

/**
 * Click a button found by its visible text content inside browser.execute().
 * Throws if the button is not found — prevents silent false-green tests.
 */
export async function clickButtonByText(text: string): Promise<void> {
  const found = await browser.execute((t: string) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => b.textContent?.trim() === t);
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!found) throw new Error(`Button with text "${text}" not found`);
}

/**
 * Send keys to the tmux session directly (server-side).
 * Useful for generating scrollback or interacting without the browser.
 */
export function sendTmuxKeys(keys: string): void {
  execSync(`tmux send-keys -t ${SESSION_NAME} ${keys}`);
}

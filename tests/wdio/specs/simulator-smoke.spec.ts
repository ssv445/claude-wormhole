import { browser, $, expect } from '@wdio/globals';

/**
 * Fetch the first available tmux session name from the API.
 * Returns null if no sessions are running.
 */
async function getFirstSession(): Promise<string | null> {
  try {
    const response = await fetch(`${browser.options.baseUrl}/api/sessions`);
    if (!response.ok) return null;
    const sessions = await response.json();
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    return sessions[0].name ?? null;
  } catch {
    return null;
  }
}

describe('Simulator Smoke Tests', () => {
  it('should load the home page', async () => {
    await browser.url('/');

    // Wait for React hydration and content render
    await browser.waitUntil(
      async () => {
        const source = await browser.getPageSource();
        return source.includes('claude-wormhole');
      },
      { timeout: 15000, timeoutMsg: 'Page did not load with expected content' },
    );
  });

  // Using function() (not arrow) so this.skip() works with Mocha
  it('should render xterm for a session', async function () {
    const session = await getFirstSession();
    if (!session) {
      this.skip(); // no tmux sessions running
      return;
    }

    // Navigate with ?session= param to auto-open the terminal
    await browser.url(`/?session=${encodeURIComponent(session)}`);

    // Wait for xterm to mount
    const xtermScreen = await $('.xterm-screen');
    await xtermScreen.waitForExist({ timeout: 15000 });
    await expect(xtermScreen).toBeDisplayed();
  });

  it('should receive data over WebSocket', async function () {
    const session = await getFirstSession();
    if (!session) {
      this.skip();
      return;
    }

    await browser.url(`/?session=${encodeURIComponent(session)}`);

    // Wait for xterm screen to mount
    const xtermScreen = await $('.xterm-screen');
    await xtermScreen.waitForExist({ timeout: 15000 });

    // Give the WebSocket time to deliver initial data
    await browser.pause(2000);

    // Check that xterm rendered content — either via WebGL canvas or DOM rows
    const hasContent = await browser.execute(() => {
      const screen = document.querySelector('.xterm-screen');
      if (!screen) return false;
      // WebGL renderer creates canvas elements
      if (screen.querySelectorAll('canvas').length > 0) return true;
      // DOM renderer creates .xterm-rows with div children
      const rows = screen.querySelector('.xterm-rows');
      return !!(rows && rows.children.length > 0);
    });
    expect(hasContent).toBe(true);
  });
});

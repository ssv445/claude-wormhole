import { browser, $, expect } from '@wdio/globals';
import { SESSION_NAME, navigateToHome, navigateToSession, getTmuxPaneContent } from '../helpers/terminal.js';

describe('Terminal Rendering', () => {
  it('should show session list on home page', async () => {
    await navigateToHome();

    // After hydration + API fetch, the test session should appear
    const text: string = await browser.execute(() => document.body.innerText);
    expect(text).toContain(SESSION_NAME);
  });

  it('should render xterm for the session', async () => {
    await navigateToSession();

    const screen = await $('.xterm-screen');
    await expect(screen).toBeDisplayed();

    // xterm renders via canvas elements
    const hasCanvas = await browser.execute(() => {
      const s = document.querySelector('.xterm-screen');
      return s ? s.querySelectorAll('canvas').length > 0 : false;
    });
    expect(hasCanvas).toBe(true);
  });

  it('should show Claude Code prompt in terminal', async () => {
    await navigateToSession();

    // Read from tmux pane (server-side) — reliable regardless of xterm rendering
    const pane = getTmuxPaneContent();
    const hasPrompt = pane.includes('\u276f') || pane.includes('>') || pane.toLowerCase().includes('claude');
    expect(hasPrompt).toBe(true);
  });
});

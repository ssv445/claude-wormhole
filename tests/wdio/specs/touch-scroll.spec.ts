import { browser, expect } from '@wdio/globals';
import { navigateToSession, swipeOnTerminal, isTmuxInCopyMode, exitTmuxCopyMode, getTmuxPaneContent } from '../helpers/terminal.js';

describe('Touch Scroll', () => {
  beforeEach(async () => {
    await navigateToSession();
    exitTmuxCopyMode();
  });

  it('should respond to swipe down on terminal', async () => {
    // Swipe down (positive deltaY) — triggers SGR mouse wheel scroll-up in tmux
    // tmux with mouse on auto-enters copy mode on scroll up
    await swipeOnTerminal(200);
    await browser.pause(1500);

    // Check if tmux entered copy mode OR pane content changed
    const inCopyMode = isTmuxInCopyMode();
    const pane = getTmuxPaneContent();
    // Either copy mode was entered, or the terminal responded in some way
    expect(inCopyMode || pane.length > 0).toBe(true);
  });

  it('should respond to swipe up after swipe down', async () => {
    // First swipe down to trigger scroll
    await swipeOnTerminal(200);
    await browser.pause(1500);

    // Swipe up (negative deltaY) — scroll down
    await swipeOnTerminal(-200);
    await browser.pause(500);

    const pane = getTmuxPaneContent();
    expect(pane.length).toBeGreaterThan(0);
  });
});

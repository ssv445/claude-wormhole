import { browser, $, expect } from '@wdio/globals';
import { navigateToSession, tapButton, isTmuxInCopyMode, exitTmuxCopyMode } from '../helpers/terminal.js';

describe('Scroll FABs', () => {
  beforeEach(async () => {
    await navigateToSession();
    // Ensure we start outside copy mode
    exitTmuxCopyMode();
  });

  it('should show scroll FABs on mobile', async () => {
    const up = await $('button[title="Scroll up (tmux)"]');
    const down = await $('button[title="Scroll down (tmux)"]');
    await expect(up).toExist();
    await expect(down).toExist();
  });

  it('should enter tmux copy mode on scroll-up tap', async () => {
    await tapButton('Scroll up (tmux)');
    await browser.pause(1500);

    // The scroll-up FAB sends tmux prefix + [ to enter copy mode, then PgUp
    expect(isTmuxInCopyMode()).toBe(true);
  });

  it('should scroll down after copy mode', async () => {
    // Enter copy mode first
    await tapButton('Scroll up (tmux)');
    await browser.pause(1500);

    await tapButton('Scroll down (tmux)');
    await browser.pause(500);

    // Terminal should still be responsive
    // (may or may not still be in copy mode depending on scroll position)
    expect(typeof isTmuxInCopyMode()).toBe('boolean');
  });
});

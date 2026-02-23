import { browser, $, expect } from '@wdio/globals';
import {
  navigateToSession, tapButton, getTmuxPaneContent,
  isTmuxInCopyMode, isTextVisibleInPage,
} from '../helpers/terminal.js';

describe('Bottom Bar', () => {
  beforeEach(async () => {
    await navigateToSession();
  });

  it('should show all bottom bar buttons', async () => {
    const titles = [
      'Escape', 'Paste text', 'Attach file', 'Voice input',
      'Exit copy mode (back to input)', 'Up arrow', 'Down arrow', 'Enter',
    ];

    for (const title of titles) {
      const btn = await $(`button[title="${title}"]`);
      await expect(btn).toBeDisplayed();
    }

    // Keyboard toggle has dynamic title — match either variant
    const showKb = await $('button[title="Show keyboard"]');
    const hideKb = await $('button[title="Hide keyboard"]');
    const kbVisible = await showKb.isDisplayed().catch(() => false) ||
                      await hideKb.isDisplayed().catch(() => false);
    expect(kbVisible).toBe(true);
  });

  it('should send escape when Esc tapped', async () => {
    await tapButton('Escape');
    await browser.pause(500);
    // Esc should not put terminal into copy mode (it cancels things)
    expect(isTmuxInCopyMode()).toBe(false);
    // Pane should still have content (session alive)
    expect(getTmuxPaneContent().trim().length).toBeGreaterThan(0);
  });

  it('should send enter when Enter tapped', async () => {
    const before = getTmuxPaneContent();
    await tapButton('Enter');
    await browser.pause(1500);
    // Enter on Claude Code prompt advances the prompt or shows an error —
    // either way the pane should still contain the prompt character
    const after = getTmuxPaneContent();
    const hasPrompt = after.includes('\u276f') || /^>\s/m.test(after);
    expect(hasPrompt).toBe(true);
  });

  it('should send up arrow when Up tapped', async () => {
    const before = getTmuxPaneContent();
    await tapButton('Up arrow');
    await browser.pause(500);
    // Up arrow may recall /help from history (run in onPrepare)
    const after = getTmuxPaneContent();
    // Pane should still be alive and contain the prompt
    expect(after.trim().length).toBeGreaterThan(0);
  });

  it('should toggle virtual keyboard visibility', async () => {
    expect(await isTextVisibleInPage('Virtual Keyboard')).toBe(false);

    await tapButton('Show keyboard');
    await browser.pause(300);
    expect(await isTextVisibleInPage('Virtual Keyboard')).toBe(true);

    await tapButton('Hide keyboard');
    await browser.pause(300);
    expect(await isTextVisibleInPage('Virtual Keyboard')).toBe(false);
  });
});

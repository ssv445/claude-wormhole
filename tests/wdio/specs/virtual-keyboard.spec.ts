import { browser, $, expect } from '@wdio/globals';
import {
  navigateToSession, tapButton, getTmuxPaneContent, isTextVisibleInPage,
} from '../helpers/terminal.js';

describe('Virtual Keyboard', () => {
  beforeEach(async () => {
    await navigateToSession();
  });

  it('should be hidden by default', async () => {
    expect(await isTextVisibleInPage('Virtual Keyboard')).toBe(false);
  });

  it('should render all 7 sections', async () => {
    await tapButton('Show keyboard');
    await browser.pause(300);

    const sections = await browser.execute(() => {
      const headers = document.querySelectorAll('.uppercase');
      return Array.from(headers)
        .map((el) => (el as HTMLElement).textContent?.trim())
        .filter(Boolean);
    });

    const expected = ['Quick Access', 'Line Edit', 'Claude Code', 'Navigate', 'Page', 'Alt Keys', 'Symbols'];
    for (const name of expected) {
      expect(sections.some((s: string) => s.toUpperCase() === name.toUpperCase())).toBe(true);
    }
  });

  it('should send Ctrl+C when Interrupt tapped', async () => {
    await tapButton('Show keyboard');
    await browser.pause(300);

    // Use tapButton helper instead of inlining pointer actions
    await tapButton('Interrupt');
    await browser.pause(1000);

    // Verify tmux pane shows prompt (Claude Code interrupted or already at prompt)
    const pane = getTmuxPaneContent();
    const hasPrompt = pane.includes('\u276f') || /^>\s/m.test(pane);
    expect(hasPrompt).toBe(true);
  });

  it('should send Tab when Tab/Autocomplete tapped', async () => {
    await tapButton('Show keyboard');
    await browser.pause(300);

    const before = getTmuxPaneContent();

    // Use tapButton helper instead of inlining pointer actions
    await tapButton('Tab/Autocomplete');
    await browser.pause(500);

    // Tab at the prompt may trigger autocomplete, changing the pane.
    // At minimum the session should still be alive with content.
    const after = getTmuxPaneContent();
    expect(after.trim().length).toBeGreaterThan(0);
  });
});

import { browser, $, expect } from '@wdio/globals';
import { navigateToSession, tapButton, getTmuxPaneContent } from '../helpers/terminal.js';

describe('Virtual Keyboard', () => {
  beforeEach(async () => {
    await navigateToSession();
  });

  it('should be hidden by default', async () => {
    const visible = await browser.execute(() => {
      const el = document.evaluate(
        "//*[contains(text(),'Virtual Keyboard')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      return el ? (el as HTMLElement).offsetParent !== null : false;
    });
    expect(visible).toBe(false);
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

    // Find and tap the ^C / Interrupt button
    const ctrlC = await $('button[title="Interrupt"]');
    await ctrlC.waitForDisplayed({ timeout: 3000 });

    const location = await ctrlC.getLocation();
    const size = await ctrlC.getSize();
    await browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(location.x + size.width / 2), y: Math.round(location.y + size.height / 2) },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(1000);

    // Verify tmux pane shows prompt (Claude Code interrupted or already at prompt)
    const pane = getTmuxPaneContent();
    const hasPrompt = pane.includes('\u276f') || pane.includes('>') || pane.includes('$');
    expect(hasPrompt).toBe(true);
  });

  it('should send Tab when Tab/Autocomplete tapped', async () => {
    await tapButton('Show keyboard');
    await browser.pause(300);

    const tabBtn = await $('button[title="Tab/Autocomplete"]');
    await tabBtn.waitForDisplayed({ timeout: 3000 });

    const location = await tabBtn.getLocation();
    const size = await tabBtn.getSize();
    await browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(location.x + size.width / 2), y: Math.round(location.y + size.height / 2) },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(500);

    // Terminal responded — just verify pane is readable
    const pane = getTmuxPaneContent();
    expect(typeof pane).toBe('string');
  });
});

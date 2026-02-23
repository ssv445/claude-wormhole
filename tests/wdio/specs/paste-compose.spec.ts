import { browser, $, expect } from '@wdio/globals';
import { navigateToSession, tapButton, getTmuxPaneContent, waitForTmuxChange } from '../helpers/terminal.js';

/**
 * On iOS Simulator, clipboard.readText() throws NotAllowedError,
 * so Paste falls back to the compose overlay.
 */
describe('Paste Compose Overlay', () => {
  beforeEach(async () => {
    await navigateToSession();
  });

  it('should open compose overlay on Paste tap', async () => {
    await tapButton('Paste text');
    await browser.pause(300);

    const textarea = await $('textarea[placeholder="Paste here, then tap Send"]');
    await expect(textarea).toBeDisplayed();
  });

  it('should send pasted text to terminal', async () => {
    await tapButton('Paste text');
    await browser.pause(300);

    const textarea = await $('textarea[placeholder="Paste here, then tap Send"]');
    await textarea.setValue('echo hi');

    const before = getTmuxPaneContent();

    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const send = buttons.find((b) => b.textContent?.trim() === 'Send');
      if (send) send.click();
    });
    await browser.pause(1000);

    // Compose closes
    const gone = await $('textarea[placeholder="Paste here, then tap Send"]')
      .isDisplayed().catch(() => false);
    expect(gone).toBe(false);

    // Terminal received the text
    await waitForTmuxChange(before);
  });

  it('should close on Cancel', async () => {
    await tapButton('Paste text');
    await browser.pause(300);

    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel');
      if (cancel) cancel.click();
    });
    await browser.pause(300);

    const gone = await $('textarea[placeholder="Paste here, then tap Send"]')
      .isDisplayed().catch(() => false);
    expect(gone).toBe(false);
  });
});

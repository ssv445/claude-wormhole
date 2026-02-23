import { browser, $, expect } from '@wdio/globals';
import {
  navigateToSession, tapButton, getTmuxPaneContent,
  waitForTmuxChange, clickButtonByText,
} from '../helpers/terminal.js';

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

    // clickButtonByText throws if Send button is missing (no silent skip)
    await clickButtonByText('Send');
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

    await clickButtonByText('Cancel');
    await browser.pause(300);

    const gone = await $('textarea[placeholder="Paste here, then tap Send"]')
      .isDisplayed().catch(() => false);
    expect(gone).toBe(false);
  });
});

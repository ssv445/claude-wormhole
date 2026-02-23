import { browser, $, expect } from '@wdio/globals';
import { navigateToSession, tapButton, getTmuxPaneContent, waitForTmuxChange } from '../helpers/terminal.js';

describe('Voice Compose Overlay', () => {
  beforeEach(async () => {
    await navigateToSession();
  });

  it('should open compose overlay on mic tap', async () => {
    await tapButton('Voice input');
    await browser.pause(300);

    const textarea = await $('textarea[placeholder="Speak or type..."]');
    await expect(textarea).toBeDisplayed();
  });

  it('should send typed text to terminal', async () => {
    await tapButton('Voice input');
    await browser.pause(300);

    const textarea = await $('textarea[placeholder="Speak or type..."]');
    await textarea.setValue('/help');

    const before = getTmuxPaneContent();

    // Tap Send button via browser.execute (more reliable than finding by text)
    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const send = buttons.find((b) => b.textContent?.trim() === 'Send');
      if (send) send.click();
    });
    await browser.pause(1000);

    // Compose should close
    const stillVisible = await $('textarea[placeholder="Speak or type..."]')
      .isDisplayed().catch(() => false);
    expect(stillVisible).toBe(false);

    // Terminal content should change (Claude Code processes /help)
    await waitForTmuxChange(before, 15000);
  });

  it('should close on Cancel without sending', async () => {
    await tapButton('Voice input');
    await browser.pause(300);

    const textarea = await $('textarea[placeholder="Speak or type..."]');
    await textarea.setValue('test cancel');

    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel');
      if (cancel) cancel.click();
    });
    await browser.pause(300);

    const stillVisible = await $('textarea[placeholder="Speak or type..."]')
      .isDisplayed().catch(() => false);
    expect(stillVisible).toBe(false);
  });

  it('should close on empty Send', async () => {
    await tapButton('Voice input');
    await browser.pause(300);

    await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const send = buttons.find((b) => b.textContent?.trim() === 'Send');
      if (send) send.click();
    });
    await browser.pause(300);

    const stillVisible = await $('textarea[placeholder="Speak or type..."]')
      .isDisplayed().catch(() => false);
    expect(stillVisible).toBe(false);
  });
});

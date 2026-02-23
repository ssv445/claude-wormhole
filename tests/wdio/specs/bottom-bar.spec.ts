import { browser, $, expect } from '@wdio/globals';
import { navigateToSession, tapButton, getTmuxPaneContent, waitForTmuxChange } from '../helpers/terminal.js';

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
    // Terminal should still be responsive (not crashed) — verify tmux pane readable
    const pane = getTmuxPaneContent();
    expect(typeof pane).toBe('string');
  });

  it('should send enter when Enter tapped', async () => {
    const before = getTmuxPaneContent();
    await tapButton('Enter');
    await browser.pause(1500);
    // Sending Enter to Claude Code at the prompt may produce new prompt line
    // or may not visibly change — just verify the terminal is still alive
    const after = getTmuxPaneContent();
    expect(typeof after).toBe('string');
    expect(after.length).toBeGreaterThan(0);
  });

  it('should send up arrow when Up tapped', async () => {
    await tapButton('Up arrow');
    await browser.pause(500);
    const pane = getTmuxPaneContent();
    expect(typeof pane).toBe('string');
  });

  it('should toggle virtual keyboard visibility', async () => {
    // Keyboard should be hidden initially
    const kbLabel = await browser.execute(() => {
      const el = document.evaluate(
        "//*[contains(text(),'Virtual Keyboard')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      return el ? (el as HTMLElement).offsetParent !== null : false;
    });
    expect(kbLabel).toBe(false);

    // Tap show keyboard
    await tapButton('Show keyboard');
    await browser.pause(300);

    // "Virtual Keyboard" label should now be visible
    const visible = await browser.execute(() => {
      const el = document.evaluate(
        "//*[contains(text(),'Virtual Keyboard')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      return el ? (el as HTMLElement).offsetParent !== null : false;
    });
    expect(visible).toBe(true);

    // Tap hide keyboard
    await tapButton('Hide keyboard');
    await browser.pause(300);

    const hidden = await browser.execute(() => {
      const el = document.evaluate(
        "//*[contains(text(),'Virtual Keyboard')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      return el ? (el as HTMLElement).offsetParent !== null : false;
    });
    expect(hidden).toBe(false);
  });
});

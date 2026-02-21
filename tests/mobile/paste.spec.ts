import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  pointerDown,
} from '../helpers/terminal';

test.describe('Paste — Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('text in clipboard → sends text over WS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => 'hello mobile';
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Paste (Ctrl+V)"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('hello mobile');
    // Should NOT also send Ctrl+V (would cause double paste)
    expect(sent).not.toContain('\x16');
  });

  test('clipboard empty → sends Ctrl+V for image paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => '';
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Paste (Ctrl+V)"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('\x16');
  });

  test('clipboard has image (readText throws DataError) → sends Ctrl+V for image paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    // readText() throws non-permission error when clipboard has image but no text
    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => {
        throw new DOMException('No text on clipboard', 'DataError');
      };
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Paste (Ctrl+V)"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('\x16');
  });

  test('clipboard permission denied → sends Ctrl+V (image paste fallback)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    // Mobile Safari denies clipboard access — can't tell if clipboard has
    // text or image, so send Ctrl+V to keep image paste working
    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => {
        throw new DOMException('Clipboard access denied', 'NotAllowedError');
      };
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Paste (Ctrl+V)"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('\x16');
  });
});

test.describe('Paste — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('Cmd+V pastes text via xterm native paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);

    // Simulate browser paste event — xterm.js picks up the 'paste' event on
    // its textarea, feeds the pasted text through onData → WebSocket
    await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
      if (!textarea) throw new Error('xterm textarea not found');
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData!.setData('text/plain', 'hello desktop');
      textarea.dispatchEvent(pasteEvent);
    });

    await waitForMessages(page, 500);
    expect(sent).toContain('hello desktop');
  });

  test('Cmd+V with image does not send text', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);

    // Paste event with image data but no text — xterm should not inject any text
    await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
      if (!textarea) throw new Error('xterm textarea not found');
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      // Set image data but no text/plain
      pasteEvent.clipboardData!.setData('image/png', 'binary-data');
      textarea.dispatchEvent(pasteEvent);
    });

    await waitForMessages(page, 500);
    // No text should be sent — image paste is handled by Claude Code natively
    expect(sent.filter(m => m !== '')).toHaveLength(0);
  });

  test('paste button is hidden on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Mobile paste button should not be visible on desktop viewport
    const pasteBtn = page.locator('button[title="Paste (Ctrl+V)"]');
    await expect(pasteBtn).not.toBeVisible();
  });
});

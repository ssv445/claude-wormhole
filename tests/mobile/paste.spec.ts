import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  pointerDown,
} from '../helpers/terminal';

test.describe('Text Paste — Mobile', () => {
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
    await pointerDown(page, 'button[title="Paste text"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('hello mobile');
    // Should NOT also send Ctrl+V (would cause double paste)
    expect(sent).not.toContain('\x16');
  });

  test('clipboard empty → opens compose overlay for manual paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => '';
    });

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    await pointerDown(page, 'button[title="Paste text"]');
    // Compose overlay should appear with paste-specific placeholder
    const textarea = page.locator('textarea[placeholder="Paste here, then tap Send"]');
    await expect(textarea).toBeVisible({ timeout: 2000 });
  });

  test('clipboard permission denied → opens compose overlay for manual paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => {
        throw new DOMException('Clipboard access denied', 'NotAllowedError');
      };
    });

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    await pointerDown(page, 'button[title="Paste text"]');
    // Compose overlay should appear with paste-specific placeholder
    const textarea = page.locator('textarea[placeholder="Paste here, then tap Send"]');
    await expect(textarea).toBeVisible({ timeout: 2000 });
  });

  test('compose overlay Send in paste mode → sends raw text without Enter', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => {
        throw new DOMException('Clipboard access denied', 'NotAllowedError');
      };
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Open compose overlay via paste button
    await pointerDown(page, 'button[title="Paste text"]');
    const textarea = page.locator('textarea[placeholder="Paste here, then tap Send"]');
    await expect(textarea).toBeVisible({ timeout: 2000 });

    // Type text and tap Send
    await textarea.fill('pasted content');
    clearMessages(sent);
    await page.click('button:has-text("Send")');
    await waitForMessages(page, 500);

    // Paste mode sends raw text — no trailing \r
    expect(sent).toContain('pasted content');
    expect(sent).not.toContain('pasted content\r');
  });
});

// Image paste tests removed — replaced by file attach (see attach.spec.ts)

test.describe('Paste — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('Cmd+V pastes text via xterm native paste', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);

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

    await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
      if (!textarea) throw new Error('xterm textarea not found');
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData!.setData('image/png', 'binary-data');
      textarea.dispatchEvent(pasteEvent);
    });

    await waitForMessages(page, 500);
    expect(sent.filter(m => m !== '')).toHaveLength(0);
  });

  test('paste buttons are hidden on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    const textPasteBtn = page.locator('button[title="Paste text"]');
    const attachBtn = page.locator('button[title="Attach file"]');
    await expect(textPasteBtn).not.toBeVisible();
    await expect(attachBtn).not.toBeVisible();
  });
});

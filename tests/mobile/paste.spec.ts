import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  pointerDown,
} from '../helpers/terminal';

test.describe('Paste', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('clipboard has text → sends text over WS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    // Stub clipboard.readText to return "hello"
    await page.addInitScript(() => {
      navigator.clipboard.readText = async () => 'hello';
    });

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Paste (Ctrl+V)"]');
    await waitForMessages(page, 500);

    expect(sent).toContain('hello');
  });

  test('clipboard empty → sends Ctrl+V (\\x16)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    // Stub clipboard.readText to return empty string
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

  test('clipboard permission denied → does NOT send Ctrl+V', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    // Stub clipboard.readText to throw (simulating denied permission on mobile)
    // Should not fall back to Ctrl+V — that triggers Claude Code's "no image" warning
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

    expect(sent).not.toContain('\x16');
  });
});

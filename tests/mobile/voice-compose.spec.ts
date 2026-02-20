import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  pointerDown,
} from '../helpers/terminal';

test.describe('Voice compose overlay', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('tap mic opens compose overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    await pointerDown(page, 'button[title="Voice input"]');
    await waitForMessages(page, 300);

    // Compose overlay has a textarea with placeholder "Speak or type..."
    await expect(page.locator('textarea[placeholder="Speak or type..."]')).toBeVisible();
    // And Send/Cancel buttons
    await expect(page.locator('button:has-text("Send")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
  });

  test('type text + Send → WS receives text\\r, overlay closes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Open compose
    await pointerDown(page, 'button[title="Voice input"]');
    await waitForMessages(page, 300);

    // Type in textarea
    const textarea = page.locator('textarea[placeholder="Speak or type..."]');
    await textarea.fill('test');

    clearMessages(sent);
    await page.locator('button:has-text("Send")').click();
    await waitForMessages(page, 300);

    expect(sent).toContain('test\r');

    // Overlay should be gone
    await expect(textarea).toBeHidden();
  });

  test('Cancel → overlay closes, nothing sent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    await pointerDown(page, 'button[title="Voice input"]');
    await waitForMessages(page, 300);

    const textarea = page.locator('textarea[placeholder="Speak or type..."]');
    await textarea.fill('should not send');

    clearMessages(sent);
    await page.locator('button:has-text("Cancel")').click();
    await waitForMessages(page, 300);

    // Nothing sent
    expect(sent.filter((m) => m.includes('should not send'))).toHaveLength(0);

    // Overlay closed
    await expect(textarea).toBeHidden();
  });

  test('Send with empty text → nothing sent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    await pointerDown(page, 'button[title="Voice input"]');
    await waitForMessages(page, 300);

    clearMessages(sent);
    // Don't type anything, just hit Send
    await page.locator('button:has-text("Send")').click();
    await waitForMessages(page, 300);

    // No message containing \r should have been sent (except potentially from init)
    expect(sent.filter((m) => m.includes('\r'))).toHaveLength(0);
  });

  test('hidden on desktop viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // The bottom bar (with mic button) should not be visible on desktop
    const bottomBar = page.locator('div.md\\:hidden.h-11');
    await expect(bottomBar).toBeHidden();
  });
});

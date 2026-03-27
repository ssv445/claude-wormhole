/**
 * Tests for mobile keyboard layout — viewport monitor integration.
 * Verifies: --vh CSS var updates on keyboard open/close, safe-area
 * handled via --safe-bottom CSS var, main container uses var(--vh).
 */
import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  stubBrowserAPIs,
} from '../helpers/terminal';

/**
 * Simulate native keyboard open/close by mocking visualViewport resize.
 * The viewport module reads: window.innerHeight - visualViewport.height
 */
async function simulateKeyboard(page: import('@playwright/test').Page, height: number) {
  await page.evaluate((kbHeight) => {
    const vv = window.visualViewport;
    if (vv) {
      Object.defineProperty(vv, 'height', {
        get: () => window.innerHeight - kbHeight,
        configurable: true,
      });
      vv.dispatchEvent(new Event('resize'));
    }
  }, height);
  // Let viewport module update + React re-render
  await page.waitForTimeout(300);
}

test.describe('Keyboard layout fixes', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test.describe('Issue 1: Safe area via --safe-bottom CSS var', () => {
    test('--safe-bottom is 0px when keyboard is open', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await simulateKeyboard(page, 300);

      const safeBottom = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom').trim()
      );
      expect(safeBottom).toBe('0px');
    });

    test('--safe-bottom uses env() when keyboard is closed', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await simulateKeyboard(page, 0);

      const safeBottom = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom').trim()
      );
      // env(safe-area-inset-bottom) resolves to 0px in test browsers (no notch)
      // but the CSS var should be set (not empty)
      expect(safeBottom).toBeTruthy();
    });

    test('desktop is unaffected — no keyboard height', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      // Main area uses --vh, no translateY
      expect(style).toContain('var(--vh');
      expect(style).not.toContain('translateY');
    });
  });

  test.describe('Issue 2: Main wrapper uses --vh height', () => {
    test('main wrapper has height: var(--vh)', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      expect(style).toContain('var(--vh');
    });

    test('--vh shrinks when keyboard opens', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const vhBefore = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vh').trim()
      );

      await simulateKeyboard(page, 300);

      const vhAfter = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vh').trim()
      );

      const before = parseInt(vhBefore);
      const after = parseInt(vhAfter);
      expect(before - after).toBeGreaterThanOrEqual(250); // ~300px keyboard
    });

    test('--vh restores when keyboard closes', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const vhOriginal = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vh').trim()
      );

      await simulateKeyboard(page, 300);
      // Wait for close delay (100ms in viewport module)
      await simulateKeyboard(page, 0);
      await page.waitForTimeout(200);

      const vhRestored = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vh').trim()
      );

      expect(vhRestored).toBe(vhOriginal);
    });

    test('empty state (no session) also uses --vh', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await page.goto('/');
      await page.waitForSelector('button[title="Sessions"]', { timeout: 10_000 });

      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      expect(style).toContain('var(--vh');
    });

    test('TerminalView does NOT have translateY', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await simulateKeyboard(page, 300);

      const terminalRoot = page.locator('.xterm-screen').locator('xpath=ancestor::div[contains(@class,"flex-col")][contains(@class,"flex-1")][contains(@class,"min-h-0")]');
      const style = await terminalRoot.getAttribute('style');
      expect(style).not.toContain('translateY');
    });
  });
});

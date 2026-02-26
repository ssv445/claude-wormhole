/**
 * Tests for mobile keyboard layout fixes (Issue #50).
 * Verifies: safe-area zero when keyboard open, translateY on main wrapper
 * (covers both terminal and empty state), and fit() on visibility/focus change.
 */
import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  stubBrowserAPIs,
} from '../helpers/terminal';

/**
 * Simulate native keyboard open/close by mocking visualViewport resize.
 * Sets window.__mockKeyboardHeight for the React component to pick up
 * via the visualViewport resize event.
 */
async function simulateKeyboard(page: import('@playwright/test').Page, height: number) {
  await page.evaluate((kbHeight) => {
    // Trigger the visualViewport resize handler that page.tsx listens to.
    // The handler reads: window.innerHeight - visualViewport.height
    // We mock visualViewport.height to simulate keyboard presence.
    const vv = window.visualViewport;
    if (vv) {
      Object.defineProperty(vv, 'height', {
        get: () => window.innerHeight - kbHeight,
        configurable: true,
      });
      vv.dispatchEvent(new Event('resize'));
    }
  }, height);
  // Let React state update propagate
  await page.waitForTimeout(300);
}

test.describe('Keyboard layout fixes', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test.describe('Issue 1: Safe area zero when keyboard open', () => {
    test('bottom bar has no safe-area padding when keyboard is open', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Simulate keyboard open (300px)
      await simulateKeyboard(page, 300);

      // Bottom bar wrapper should have paddingBottom: 0px
      const bottomBarWrapper = page.locator('button[title="Escape"]').locator('xpath=ancestor::div[contains(@class,"shrink-0")][contains(@class,"md:hidden")]');
      const style = await bottomBarWrapper.getAttribute('style');
      expect(style).toContain('padding-bottom: 0px');
    });

    test('bottom bar has safe-area padding when keyboard is closed', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Keyboard closed (0)
      await simulateKeyboard(page, 0);

      const bottomBarWrapper = page.locator('button[title="Escape"]').locator('xpath=ancestor::div[contains(@class,"shrink-0")][contains(@class,"md:hidden")]');
      const style = await bottomBarWrapper.getAttribute('style');
      expect(style).toContain('safe-area-inset-bottom');
    });

    test('virtual keyboard bleed div is zero when keyboard open', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Open virtual keyboard panel
      await page.locator('button[title="Show keyboard"]').click();
      await expect(page.locator('text=Virtual Keyboard')).toBeVisible();

      // Simulate native keyboard
      await simulateKeyboard(page, 300);

      // The bleed div inside the virtual keyboard panel
      const kbPanel = page.locator('text=Virtual Keyboard').locator('xpath=ancestor::div[contains(@class,"rounded-t-xl")]');
      const bleedDiv = kbPanel.locator('div').last();
      const style = await bleedDiv.getAttribute('style');
      expect(style).toContain('height: 0px');
    });

    test('desktop is unaffected — nativeKeyboardHeight always 0', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Main wrapper should have translateY(0)
      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      expect(style).toContain('translateY(0)');
    });
  });

  test.describe('Issue 2: Main wrapper translateY', () => {
    test('main wrapper gets translateY when keyboard opens', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await simulateKeyboard(page, 300);

      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      expect(style).toContain('translateY(-300px)');
    });

    test('main wrapper resets translateY when keyboard closes', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Open keyboard
      await simulateKeyboard(page, 300);
      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      let style = await mainArea.getAttribute('style');
      expect(style).toContain('translateY(-300px)');

      // Close keyboard
      await simulateKeyboard(page, 0);

      style = await mainArea.getAttribute('style');
      // Browser may render as translateY(0) or translateY(0px)
      expect(style).toMatch(/translateY\(0(px)?\)/);
    });

    test('empty state (no session) also gets translateY', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      // Navigate to home WITHOUT a session — shows empty state
      await page.goto('/');
      await page.waitForSelector('button[title="Sessions"]', { timeout: 10_000 });

      await simulateKeyboard(page, 300);

      const mainArea = page.locator('.flex-1.flex.flex-col.min-w-0');
      const style = await mainArea.getAttribute('style');
      expect(style).toContain('translateY(-300px)');
    });

    test('TerminalView does NOT have its own translateY', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await simulateKeyboard(page, 300);

      // The terminal root div should only have display and backgroundColor, no transform
      const terminalRoot = page.locator('.xterm-screen').locator('xpath=ancestor::div[contains(@class,"flex-col")][contains(@class,"flex-1")][contains(@class,"min-h-0")]');
      const style = await terminalRoot.getAttribute('style');
      expect(style).not.toContain('translateY(-300px)');
    });

    test('NewSessionDialog is not inside translated wrapper', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await page.goto('/');
      await page.waitForSelector('button[title="Sessions"]', { timeout: 10_000 });

      // Open sidebar first (New session button is inside the sidebar on mobile)
      await page.locator('button[title="Sessions"]').click();
      await page.waitForTimeout(200);

      // Open new session dialog from the sidebar
      await page.locator('.fixed.inset-0.z-40 button[title="New session"]').click();
      await page.waitForTimeout(200);

      // The dialog should be a sibling of the main area, not a child
      const dialog = page.locator('input[placeholder]').first();
      if (await dialog.isVisible()) {
        const hasTranslatedParent = await dialog.evaluate((el) => {
          let parent = el.parentElement;
          while (parent) {
            const transform = parent.style.transform;
            if (transform && transform.includes('translateY') && transform !== 'translateY(0)') {
              if (parent.classList.contains('min-w-0')) return true;
            }
            parent = parent.parentElement;
          }
          return false;
        });
        expect(hasTranslatedParent).toBe(false);
      }
    });
  });

  test.describe('Issue 4: Resize on visibility/focus', () => {
    test('terminal sends resize after visibilitychange', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      const sent = await setupTerminalMocks(page);
      await openTerminalSession(page);
      // Wait for initial setup
      await page.waitForTimeout(500);

      // Record current terminal size messages
      const resizesBefore = sent.filter(m => m.includes('"type":"resize"')).length;

      // Change viewport size to simulate device switch while backgrounded
      await page.setViewportSize({ width: 500, height: 800 });
      await page.waitForTimeout(100);

      // Trigger visibilitychange
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // Wait for rAF + fit + WS message
      await page.waitForTimeout(300);

      const resizesAfter = sent.filter(m => m.includes('"type":"resize"')).length;
      expect(resizesAfter).toBeGreaterThan(resizesBefore);
    });

    test('terminal sends resize after window focus', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      const sent = await setupTerminalMocks(page);
      await openTerminalSession(page);
      await page.waitForTimeout(500);

      const resizesBefore = sent.filter(m => m.includes('"type":"resize"')).length;

      // Change viewport then fire focus
      await page.setViewportSize({ width: 480, height: 750 });
      await page.waitForTimeout(100);

      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForTimeout(300);

      const resizesAfter = sent.filter(m => m.includes('"type":"resize"')).length;
      expect(resizesAfter).toBeGreaterThan(resizesBefore);
    });
  });

  test.describe('Regression checks', () => {
    test('virtual keyboard panel still opens and closes', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await page.locator('button[title="Show keyboard"]').click();
      await expect(page.locator('text=Virtual Keyboard')).toBeVisible();

      await page.locator('button[title="Hide keyboard"]').click();
      await expect(page.locator('text=Virtual Keyboard')).toBeHidden();
    });

    test('bottom bar buttons still visible after keyboard sim', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Open and close keyboard
      await simulateKeyboard(page, 300);
      await simulateKeyboard(page, 0);

      // Bottom bar buttons should still be visible
      await expect(page.locator('button[title="Escape"]')).toBeVisible();
      await expect(page.locator('button[title="Enter"]')).toBeVisible();
    });
  });
});

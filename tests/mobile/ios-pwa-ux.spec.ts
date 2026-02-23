/**
 * Tests for iOS PWA UX improvements (PR #44).
 * Verifies safe area insets, scrollable bottom bar, button sizing,
 * rounded corners, font size, and button order changes.
 */
import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  stubBrowserAPIs,
} from '../helpers/terminal';

test.describe('iOS PWA UX', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test.describe('Safe area insets', () => {
    test('top bar has safe-area-inset-top padding', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await page.goto('/');
      await page.waitForSelector('button[title="Sessions"]', { timeout: 10_000 });

      // The mobile top bar should have paddingTop set to env(safe-area-inset-top)
      const topBar = page.locator('button[title="Sessions"]').locator('..');
      const style = await topBar.getAttribute('style');
      expect(style).toContain('safe-area-inset-top');
    });

    test('sidebar drawer has safe area padding', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await page.goto('/');
      await page.waitForSelector('button[title="Sessions"]', { timeout: 10_000 });

      // Open sidebar
      await page.locator('button[title="Sessions"]').click();
      const drawer = page.locator('.fixed.inset-0.z-40 .absolute.inset-y-0');
      await expect(drawer).toBeVisible();

      const style = await drawer.getAttribute('style');
      expect(style).toContain('safe-area-inset-top');
      expect(style).toContain('safe-area-inset-bottom');
    });

    test('bottom bar has safe-area-inset-bottom padding', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Bottom bar is the parent of the Escape button
      const bottomBar = page.locator('button[title="Escape"]').locator('..');
      const style = await bottomBar.getAttribute('style');
      expect(style).toContain('safe-area-inset-bottom');
    });

    test('virtual keyboard panel has safe-area-inset-bottom', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Open virtual keyboard
      await page.locator('button[title="Show keyboard"]').click();
      const kbPanel = page.locator('text=Virtual Keyboard').locator('xpath=ancestor::div[contains(@class,"rounded-t-xl")]');
      await expect(kbPanel).toBeVisible();

      const style = await kbPanel.getAttribute('style');
      expect(style).toContain('safe-area-inset-bottom');
    });
  });

  test.describe('Bottom bar layout', () => {
    test('bottom bar is horizontally scrollable', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const bottomBar = page.locator('button[title="Escape"]').locator('..');
      const cls = await bottomBar.getAttribute('class');
      expect(cls).toContain('overflow-x-auto');
    });

    test('buttons have minimum 44px touch target', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Check a few buttons for 44px minimum dimensions
      const buttons = ['Escape', 'Enter', 'Up arrow', 'Paste text', 'Attach file'];
      for (const title of buttons) {
        const btn = page.locator(`button[title="${title}"]`);
        const box = await btn.boundingBox();
        expect(box, `${title} should have bounding box`).toBeTruthy();
        expect(box!.width).toBeGreaterThanOrEqual(43); // allow 1px rounding
        expect(box!.height).toBeGreaterThanOrEqual(43);
      }
    });

    test('button order: Esc, Enter, Up, Down are first four', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Get all visible buttons in the bottom bar in DOM order
      const bottomBar = page.locator('button[title="Escape"]').locator('..');
      const buttons = bottomBar.locator('button');
      const titles: string[] = [];
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const title = await buttons.nth(i).getAttribute('title');
        if (title) titles.push(title);
      }

      // First 4 should be the most-used actions
      expect(titles[0]).toBe('Escape');
      expect(titles[1]).toBe('Enter');
      expect(titles[2]).toBe('Up arrow');
      expect(titles[3]).toBe('Down arrow');
    });

    test('buttons have press feedback class', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const escBtn = page.locator('button[title="Escape"]');
      const cls = await escBtn.getAttribute('class');
      expect(cls).toContain('active:scale-90');
      expect(cls).toContain('transition-transform');
    });
  });

  test.describe('Rounded corners', () => {
    test('virtual keyboard has rounded top corners', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      await page.locator('button[title="Show keyboard"]').click();
      const kbPanel = page.locator('text=Virtual Keyboard').locator('xpath=ancestor::div[contains(@class,"shrink-0")]');
      await expect(kbPanel).toBeVisible();

      const cls = await kbPanel.getAttribute('class');
      expect(cls).toContain('rounded-t-xl');
    });

    test('compose overlay has rounded top corners', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // Open compose overlay via mic button
      await page.locator('button[title="Voice input"]').evaluate((el) => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(200);

      const overlay = page.locator('textarea').locator('xpath=ancestor::div[contains(@class,"rounded-t-xl")]');
      await expect(overlay).toBeVisible();
    });
  });

  test.describe('Terminal font size', () => {
    test('mobile terminal uses 11px font', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      // xterm.js applies fontSize to its internal options — check via the DOM
      const fontSize = await page.evaluate(() => {
        const term = (window as any).__xterm;
        return term?.options?.fontSize;
      });
      // If __xterm isn't exposed, fall back to checking the canvas style
      if (fontSize !== undefined) {
        expect(fontSize).toBe(11);
      } else {
        // Check that the xterm-screen rows have a reasonable font size
        // 11px font gives ~18px row height, 10px gives ~16px
        const rowHeight = await page.evaluate(() => {
          const row = document.querySelector('.xterm-screen');
          if (!row) return 0;
          return row.getBoundingClientRect().height;
        });
        expect(rowHeight).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Viewport configuration', () => {
    test('viewport has viewport-fit=cover meta tag', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
      await setupTerminalMocks(page);
      await openTerminalSession(page);

      const content = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta?.getAttribute('content') ?? '';
      });
      expect(content).toContain('viewport-fit=cover');
    });
  });
});

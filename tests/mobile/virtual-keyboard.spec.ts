import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
} from '../helpers/terminal';

test.describe('Virtual keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('hidden by default', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    await expect(page.locator('text=Virtual Keyboard')).toBeHidden();
  });

  test('toggle shows/hides panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Show
    await page.locator('button[title="Show keyboard"]').click();
    await expect(page.locator('text=Virtual Keyboard')).toBeVisible();

    // Hide via X button
    await page.locator('button[title="Hide keyboard"]').click();
    await expect(page.locator('text=Virtual Keyboard')).toBeHidden();
  });

  test('all 7 sections render', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    const sections = [
      'Quick Access', 'Line Edit', 'Claude Code',
      'Navigate', 'Page', 'Alt Keys', 'Symbols',
    ];
    for (const s of sections) {
      await expect(page.locator(`text=${s}`).first()).toBeVisible();
    }
  });

  test('tap ^C sends \\x03', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    clearMessages(sent);
    await page.locator('button[title="Interrupt"]').click();
    await waitForMessages(page);

    expect(sent).toContain('\x03');
  });

  test('tap Tab sends \\t', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    clearMessages(sent);
    // Use title to avoid matching "S+Tab"
    await page.locator('button[title="Tab/Autocomplete"]').click();
    await waitForMessages(page);

    expect(sent).toContain('\t');
  });

  test('tap Esc sends \\x1b', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    clearMessages(sent);
    await page.locator('button[title="Escape/Cancel"]').click();
    await waitForMessages(page);

    expect(sent).toContain('\x1b');
  });

  test('tap ^D sends \\x04', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    clearMessages(sent);
    await page.locator('button[title="Exit session"]').click();
    await waitForMessages(page);

    expect(sent).toContain('\x04');
  });

  test('tap / sends /', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await page.locator('button[title="Show keyboard"]').click();

    clearMessages(sent);
    await page.locator('button[title="Command"]').click();
    await waitForMessages(page);

    expect(sent).toContain('/');
  });

  test('hidden on desktop viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // The bottom bar (which contains the keyboard toggle) should be hidden
    const bottomBar = page.locator('div.md\\:hidden.h-11');
    await expect(bottomBar).toBeHidden();
  });
});

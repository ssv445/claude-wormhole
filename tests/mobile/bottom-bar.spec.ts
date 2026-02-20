import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  pointerDown,
} from '../helpers/terminal';

test.describe('Bottom bar', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('visible on mobile, hidden on desktop', async ({ page }, testInfo) => {
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    const bottomBar = page.locator('div.md\\:hidden.h-11');

    if (testInfo.project.name === 'mobile-webkit') {
      await expect(bottomBar).toBeVisible();
    } else {
      await expect(bottomBar).toBeHidden();
    }
  });

  test('Esc button sends \\x1b', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    // Wait for WS to connect and initial messages to arrive
    await waitForMessages(page, 500);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Escape"]');
    await waitForMessages(page);

    expect(sent).toContain('\x1b');
  });

  test('Enter button sends \\r', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Enter"]');
    await waitForMessages(page);

    expect(sent).toContain('\r');
  });

  test('Arrow Up sends \\x1b[A', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Up arrow"]');
    await waitForMessages(page);

    expect(sent).toContain('\x1b[A');
  });

  test('Arrow Down sends \\x1b[B', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Down arrow"]');
    await waitForMessages(page);

    expect(sent).toContain('\x1b[B');
  });

  test('Exit copy-mode (q) sends q', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    clearMessages(sent);
    await pointerDown(page, 'button[title="Exit copy mode (back to input)"]');
    await waitForMessages(page);

    expect(sent).toContain('q');
  });

  test('Keyboard toggle shows/hides virtual keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    const kbToggle = page.locator('button[title="Show keyboard"]');
    const kbPanel = page.locator('text=Virtual Keyboard');

    // Initially hidden
    await expect(kbPanel).toBeHidden();

    // Click toggle → visible
    await kbToggle.click();
    await expect(kbPanel).toBeVisible();

    // Click close (X button in keyboard header) → hidden
    await page.locator('button[title="Hide keyboard"]').click();
    await expect(kbPanel).toBeHidden();
  });
});

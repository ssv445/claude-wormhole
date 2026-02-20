import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
} from '../helpers/terminal';

test.describe('Scroll FABs', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('FABs visible on mobile, hidden on desktop', async ({ page }, testInfo) => {
    await setupTerminalMocks(page);
    await openTerminalSession(page);

    const fabContainer = page.locator('button[title="Scroll up (tmux)"]');

    if (testInfo.project.name === 'mobile-webkit') {
      await expect(fabContainer).toBeVisible();
    } else {
      await expect(fabContainer).toBeHidden();
    }
  });

  test('scroll-up FAB sends tmux copy-mode + PgUp', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await page.locator('button[title="Scroll up (tmux)"]').click();
    // Wait 200ms for the setTimeout(100ms) + message delivery
    await waitForMessages(page, 300);

    // First: tmux prefix + [ to enter copy mode (\x02[)
    expect(sent).toContain('\x02[');
    // Then: PgUp (\x1b[5~)
    expect(sent).toContain('\x1b[5~');

    // Verify order: \x02[ should come before \x1b[5~
    const copyModeIdx = sent.indexOf('\x02[');
    const pgUpIdx = sent.indexOf('\x1b[5~');
    expect(copyModeIdx).toBeLessThan(pgUpIdx);
  });

  test('scroll-down FAB sends PgDn', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);
    await page.locator('button[title="Scroll down (tmux)"]').click();
    await waitForMessages(page);

    expect(sent).toContain('\x1b[6~');
  });
});

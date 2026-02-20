import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  stubBrowserAPIs,
  dispatchTouchStart,
  dispatchTouchEnd,
  dispatchTouchMove,
  getTerminalCenter,
} from '../helpers/terminal';

test.describe('Long-press selection mode', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('hold 500ms without moving → selection bar appears', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page, { enableMouseTracking: true });
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    const { cx, cy } = await getTerminalCenter(page);

    // Simulate long press: touchstart, wait 600ms, touchend
    await dispatchTouchStart(page, cx, cy);
    await page.waitForTimeout(600);
    await dispatchTouchEnd(page, cx, cy);
    await waitForMessages(page, 200);

    // Selection mode bar should be visible
    await expect(page.locator('text=Selection mode')).toBeVisible();
  });

  test('vibrate(50) called on activation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page, { enableMouseTracking: true });
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    const { cx, cy } = await getTerminalCenter(page);

    await dispatchTouchStart(page, cx, cy);
    await page.waitForTimeout(600);

    const vibrateCalls = await page.evaluate(() => (window as any).__vibrateCalls);
    expect(vibrateCalls).toContainEqual([50]);
  });

  test('selection mode activates when mouse tracking is enabled', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page, { enableMouseTracking: true });
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    const { cx, cy } = await getTerminalCenter(page);

    // The enterSelectionMode function writes escape sequences to xterm to disable
    // mouse reporting. We verify the selection bar appears (proving the mode activated).
    await dispatchTouchStart(page, cx, cy);
    await page.waitForTimeout(600);

    await expect(page.locator('text=Selection mode')).toBeVisible();
  });

  test('Done button exits selection mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page, { enableMouseTracking: true });
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    const { cx, cy } = await getTerminalCenter(page);

    // Enter selection mode
    await dispatchTouchStart(page, cx, cy);
    await page.waitForTimeout(600);
    await dispatchTouchEnd(page, cx, cy);
    await expect(page.locator('text=Selection mode')).toBeVisible();

    // Tap Done
    await page.locator('button:has-text("Done")').click();
    await expect(page.locator('text=Selection mode')).toBeHidden();
  });

  test('move finger >10px during hold → no selection mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    await setupTerminalMocks(page, { enableMouseTracking: true });
    await openTerminalSession(page);
    await waitForMessages(page, 500);

    const { cx, cy } = await getTerminalCenter(page);

    // Start touch, then move 20px (> 10px threshold) within 200ms
    await dispatchTouchStart(page, cx, cy);
    await page.waitForTimeout(200);
    await dispatchTouchMove(page, cx, cy - 20);

    // Wait past long-press threshold
    await page.waitForTimeout(500);
    await dispatchTouchEnd(page, cx, cy - 20);

    // Selection mode should NOT have activated
    await expect(page.locator('text=Selection mode')).toBeHidden();
  });
});

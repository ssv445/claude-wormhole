import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
  dispatchTouchSequence,
  getTerminalCenter,
} from '../helpers/terminal';

test.describe('Touch scroll', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  // Scroll up in tmux = finger moves down (positive clientY delta) = deltaY negative = SGR button 64
  test('swipe down sends scroll-up SGR sequences', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    clearMessages(sent);

    const { cx, cy } = await getTerminalCenter(page);

    // Finger moves DOWN by 60px (3 steps of 20px)
    await dispatchTouchSequence(page, {
      points: [
        [cx, cy],
        [cx, cy + 20],
        [cx, cy + 40],
        [cx, cy + 60],
      ],
    });

    await waitForMessages(page, 300);

    // Finger moved down → startY - currentY < 0 → button 64 (scroll up/back in tmux)
    const scrollUps = sent.filter((m) => m === '\x1b[<64;1;1M');
    expect(scrollUps.length).toBeGreaterThan(0);
  });

  // Scroll down in tmux = finger moves up = SGR button 65
  test('swipe up sends scroll-down SGR sequences', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    clearMessages(sent);

    const { cx, cy } = await getTerminalCenter(page);

    // Finger moves UP by 60px
    await dispatchTouchSequence(page, {
      points: [
        [cx, cy],
        [cx, cy - 20],
        [cx, cy - 40],
        [cx, cy - 60],
      ],
    });

    await waitForMessages(page, 300);

    // Finger moved up → startY - currentY > 0 → button 65 (scroll down/forward)
    const scrollDowns = sent.filter((m) => m === '\x1b[<65;1;1M');
    expect(scrollDowns.length).toBeGreaterThan(0);
  });

  test('small move (<15px) does not trigger scroll', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    clearMessages(sent);

    const { cx, cy } = await getTerminalCenter(page);

    // Move only 10px — below 15px threshold
    await dispatchTouchSequence(page, {
      points: [
        [cx, cy],
        [cx, cy - 10],
      ],
    });

    await waitForMessages(page, 300);

    const scrollMsgs = sent.filter((m) => m.includes('\x1b[<64;') || m.includes('\x1b[<65;'));
    expect(scrollMsgs.length).toBe(0);
  });

  test('accumulator: 40px swipe with 20px sensitivity = 2 events', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');
    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);
    clearMessages(sent);

    const { cx, cy } = await getTerminalCenter(page);

    // Move up 40px in one big step (past 15px threshold + 40px delta)
    await dispatchTouchSequence(page, {
      points: [
        [cx, cy],
        [cx, cy - 40],
      ],
    });

    await waitForMessages(page, 300);

    // 40px / 20px sensitivity = 2 scroll events
    const scrollMsgs = sent.filter((m) => m === '\x1b[<65;1;1M');
    expect(scrollMsgs.length).toBe(2);
  });
});

import { test, expect } from '@playwright/test';
import {
  setupTerminalMocks,
  openTerminalSession,
  waitForMessages,
  clearMessages,
  stubBrowserAPIs,
} from '../helpers/terminal';

test.describe('File Attach — Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('attach button opens file picker', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Listen for the file input click
    const fileInputClicked = page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (!input) { resolve(false); return; }
        input.addEventListener('click', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 2000);
      });
    });

    await page.click('button[title="Attach file"]');
    const clicked = await fileInputClicked;
    expect(clicked).toBe(true);
  });

  test('file selected sends file_attach JSON over WS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    const sent = await setupTerminalMocks(page);
    await openTerminalSession(page);

    clearMessages(sent);

    // Programmatically set a file on the hidden input and trigger change
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) throw new Error('File input not found');
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForMessages(page, 1000);

    const attachMsg = sent.find(m => m.startsWith('{') && m.includes('file_attach'));
    expect(attachMsg).toBeTruthy();
    const parsed = JSON.parse(attachMsg!);
    expect(parsed.type).toBe('file_attach');
    expect(parsed.name).toBe('test.txt');
    expect(parsed.data).toBeTruthy();
  });

  test('server file_saved response resets attach status (path typed server-side)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Trigger a file attach that the mock WS will respond to with file_saved
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) throw new Error('File input not found');
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForMessages(page, 1000);

    // Attach button should not be disabled (status back to idle after file_saved)
    const btn = page.locator('button[title="Attach file"]');
    await expect(btn).toBeEnabled({ timeout: 3000 });
  });

  test('file > 10MB shows alert', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'Mobile only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    // Intercept alert
    const alertPromise = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        window.alert = (msg: string) => resolve(msg);
        setTimeout(() => resolve(''), 3000);
      });
    });

    // Create a file > 10MB via DataTransfer
    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) throw new Error('File input not found');
      // Create a ~11MB file
      const bigData = new Uint8Array(11 * 1024 * 1024);
      const file = new File([bigData], 'huge.bin', { type: 'application/octet-stream' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const alertMsg = await alertPromise;
    expect(alertMsg).toContain('10MB');
  });
});

test.describe('File Attach — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await stubBrowserAPIs(page);
  });

  test('attach button is hidden on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop only');

    await setupTerminalMocks(page);
    await openTerminalSession(page);

    const attachBtn = page.locator('button[title="Attach file"]');
    await expect(attachBtn).not.toBeVisible();
  });
});

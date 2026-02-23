import { browser, $, expect } from '@wdio/globals';
import { navigateToSession } from '../helpers/terminal.js';

describe('Attach File Button', () => {
  it('should show attach button on mobile', async () => {
    await navigateToSession();

    const btn = await $('button[title="Attach file"]');
    await expect(btn).toBeDisplayed();
  });
});

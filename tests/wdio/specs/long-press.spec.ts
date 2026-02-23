import { browser, expect } from '@wdio/globals';
import { navigateToSession, longPressOnTerminal, isTextVisibleInPage } from '../helpers/terminal.js';

// function (not arrow) required for Mocha's this.retries()
describe('Long Press', function () {
  // Long press + mouse tracking is fragile in simulator
  this.retries(2);

  it('should show selection mode on long press', async () => {
    await navigateToSession();

    await longPressOnTerminal(700);
    await browser.pause(500);

    // Selection mode bar should appear with "Selection mode" text
    expect(await isTextVisibleInPage('Selection mode')).toBe(true);
  });
});

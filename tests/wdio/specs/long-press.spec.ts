import { browser, expect } from '@wdio/globals';
import { navigateToSession, longPressOnTerminal } from '../helpers/terminal.js';

describe('Long Press', function () {
  // Long press + mouse tracking is fragile in simulator
  this.retries(2);

  it('should show selection mode on long press', async () => {
    await navigateToSession();

    await longPressOnTerminal(700);
    await browser.pause(500);

    // Selection mode bar should appear with "Selection mode" text
    const visible = await browser.execute(() => {
      const el = document.evaluate(
        "//*[contains(text(),'Selection mode')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      return el ? (el as HTMLElement).offsetParent !== null : false;
    });
    expect(visible).toBe(true);
  });
});

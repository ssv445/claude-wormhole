import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export const config: WebdriverIO.Config = {
  runner: 'local',

  // safaridriver serves WebDriver at localhost:4445
  hostname: 'localhost',
  port: 4445,
  path: '/',

  // Resolve specs relative to this config file's directory
  specs: [path.join(__dirname, 'specs', '**', '*.spec.ts')],

  maxInstances: 1, // safaridriver doesn't support parallel sessions

  capabilities: [
    {
      'platformName': 'iOS',
      'browserName': 'Safari',
      'safari:useSimulator': true,
      'safari:deviceType': 'iPhone',
    },
  ],

  logLevel: 'warn',
  baseUrl: `http://localhost:${process.env.PORT || 3102}`,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000, // Simulator boot is slow
  },

  reporters: ['spec'],

  // WDIO v9 calls browser.getContext() internally for BiDi context management,
  // but safaridriver doesn't support the /context endpoint. Stub it out to
  // prevent intermittent "invalid session id" errors.
  before: async () => {
    browser.overwriteCommand('getContext', async () => 'NATIVE_APP');
  },
};

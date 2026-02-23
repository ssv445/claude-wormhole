import path from 'path';
import url from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const SESSION_NAME = 'wdio-test';
const WORKSPACE = '/tmp/wdio-test-workspace';

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

  // Create a tmux session with Claude Code before any tests run
  onPrepare: async () => {
    // Clean up any leftover session
    try { execSync(`tmux kill-session -t ${SESSION_NAME} 2>/dev/null`); } catch {}

    // Create workspace and tmux session
    execSync(`mkdir -p ${WORKSPACE}`);
    execSync(
      `tmux new-session -d -s ${SESSION_NAME} -c ${WORKSPACE} "claude --dangerously-skip-permissions; exec $SHELL"`,
    );

    // Wait for Claude Code to show the prompt (up to 30s)
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const pane = execSync(`tmux capture-pane -p -t ${SESSION_NAME}`, { encoding: 'utf-8' });
        // Claude Code shows its prompt character when ready
        if (pane.includes('\u276f') || pane.includes('>')) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ready) {
      console.warn('Warning: Claude Code prompt not detected after 30s, proceeding anyway');
    }
  },

  // Kill the tmux session and clean up after all tests
  onComplete: async () => {
    try { execSync(`tmux kill-session -t ${SESSION_NAME} 2>/dev/null`); } catch {}
    try { execSync(`rm -rf ${WORKSPACE}`); } catch {}
  },

  // WDIO v9 calls browser.getContext() internally for BiDi context management,
  // but safaridriver doesn't support the /context endpoint. Stub it out to
  // prevent intermittent "invalid session id" errors.
  before: async () => {
    browser.overwriteCommand('getContext', async () => 'NATIVE_APP');
  },
};

import path from 'path';
import url from 'url';
import { execSync } from 'child_process';
import { SESSION_NAME } from './helpers/terminal.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

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

    // Create workspace and tmux session.
    // --dangerously-skip-permissions: required so Claude Code doesn't block on
    // permission prompts during automated tests. Only used on local dev machines
    // — do NOT run on shared/privileged CI runners without sandboxing.
    execSync(`mkdir -p ${WORKSPACE}`);
    execSync(
      `tmux new-session -d -s ${SESSION_NAME} -c ${WORKSPACE} "claude --dangerously-skip-permissions; exec $SHELL"`,
    );

    // Wait for Claude Code to show the ❯ prompt (up to 30s).
    // Match the actual prompt character ❯ or a > at line start (not mid-line >).
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const pane = execSync(`tmux capture-pane -p -t ${SESSION_NAME}`, { encoding: 'utf-8' });
        if (pane.includes('\u276f') || /^>\s/m.test(pane)) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ready) {
      throw new Error('Claude Code prompt not detected after 30s — aborting test run');
    }

    // Generate scrollback so scroll tests have real content to scroll through.
    // /help is a safe local command that produces ~30 lines of output.
    execSync(`tmux send-keys -t ${SESSION_NAME} '/help' Enter`);
    // Wait for /help output to render
    const helpDeadline = Date.now() + 15000;
    while (Date.now() < helpDeadline) {
      try {
        const pane = execSync(`tmux capture-pane -p -t ${SESSION_NAME}`, { encoding: 'utf-8' });
        // /help output is done when the prompt reappears after the help text
        if (pane.includes('help') && (pane.includes('\u276f') || /^>\s/m.test(pane))) {
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
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

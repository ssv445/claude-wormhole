import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, readFileSync } from 'fs';

const execFileAsync = promisify(execFile);

const PAUSE_DIR = '/tmp/wormhole-paused';

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateSessionName(name: string): string {
  if (!SESSION_NAME_RE.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
  return name;
}

// Claude Code state detected from tmux pane content
export type ClaudeHint = 'idle' | 'busy' | null;

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  workingDir: string;
  lastActivity: string;
  claudeHint: ClaudeHint;
  paused: boolean;
}

export async function listSessionsWithInfo(): Promise<SessionInfo[]> {
  try {
    const { stdout } = await execFileAsync('tmux', [
      'list-sessions',
      '-F',
      '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_path}|#{session_activity}',
    ]);

    const sessions = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached, created, sessionPath, activity] =
          line.split('|');
        return {
          name,
          windows: parseInt(windows, 10),
          attached: attached === '1',
          created: new Date(parseInt(created, 10) * 1000).toLocaleString(),
          workingDir: sessionPath || '',
          lastActivity: activity
            ? formatLastActivity(parseInt(activity, 10))
            : '',
          claudeHint: null as ClaudeHint,
          paused: isSessionPaused(name),
        };
      });

    // Get current pane path and Claude hint for each session
    for (const session of sessions) {
      try {
        const { stdout: pathOut } = await execFileAsync('tmux', [
          'display-message',
          '-p',
          '-t',
          session.name,
          '#{pane_current_path}',
        ]);
        session.workingDir = pathOut.trim();
      } catch {
        // keep session_path as fallback
      }

      // Detect Claude Code state by checking pane content for the ❯ prompt
      if (session.attached) {
        try {
          const { stdout: paneContent } = await execFileAsync('tmux', [
            'capture-pane', '-t', session.name, '-p',
          ]);
          const lines = paneContent.trimEnd().split('\n');
          const lastLines = lines.slice(-5).join('');
          session.claudeHint = lastLines.includes('❯') ? 'idle' : 'busy';
        } catch {
          // can't read pane
        }
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

export async function newSession(
  name: string,
  workingDir?: string
): Promise<void> {
  validateSessionName(name);
  const args = ['new-session', '-d', '-s', name];
  if (workingDir) {
    args.push('-c', workingDir);
  }
  await execFileAsync('tmux', args);
}

export async function renameSession(
  oldName: string,
  newName: string
): Promise<void> {
  validateSessionName(oldName);
  validateSessionName(newName);
  await execFileAsync('tmux', ['rename-session', '-t', oldName, newName]);
}

export async function killSession(name: string): Promise<void> {
  validateSessionName(name);
  // Resume frozen processes before killing so children don't stay stopped
  if (isSessionPaused(name)) {
    try { await resumeSession(name); } catch { /* proceed with kill regardless */ }
  }
  await execFileAsync('tmux', ['kill-session', '-t', name]);
}

/** Restart the Claude Code process inside a tmux session.
 *  Reads the cached Claude session ID (written by the statusline hook),
 *  sends /exit to quit the running Claude, then launches cld --resume. */
export async function restartClaudeSession(name: string): Promise<void> {
  validateSessionName(name);

  // Read cached Claude session ID written by statusline hook
  const cacheFile = `/tmp/wormhole-claude-session-${name}`;
  let claudeSessionId: string | null = null;
  try {
    claudeSessionId = readFileSync(cacheFile, 'utf8').trim();
  } catch {
    // no cached session ID
  }
  if (!claudeSessionId) {
    throw new Error(`No Claude session ID cached for "${name}". Has the session run recently?`);
  }

  // Send /exit + Enter to quit the running Claude Code process
  await execFileAsync('tmux', ['send-keys', '-t', name, '/exit', 'Enter']);

  // Wait for the Claude process to exit (poll for shell prompt)
  const maxWait = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const { stdout } = await execFileAsync('tmux', [
        'capture-pane', '-t', name, '-p',
      ]);
      const lastLines = stdout.trimEnd().split('\n').slice(-3).join('');
      // Shell prompt: ends with $ or % (zsh/bash prompt after Claude exits)
      if (/[$%#]\s*$/.test(lastLines)) break;
    } catch {
      break;
    }
  }

  // Restart with cld --resume <sessionId>
  await execFileAsync('tmux', [
    'send-keys', '-t', name, `cld --resume ${claudeSessionId}`, 'Enter',
  ]);
}

function formatLastActivity(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Pause / Resume ──

/** Get the shell PID for a tmux session's active pane */
async function getPanePid(sessionName: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('tmux', [
      'display-message', '-p', '-t', sessionName, '#{pane_pid}',
    ]);
    const pid = parseInt(stdout.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Recursively get all descendant PIDs of a process */
async function getDescendants(pid: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)]);
    const children = stdout.trim().split('\n').filter(Boolean).map(Number);
    const nested = await Promise.all(children.map(getDescendants));
    return [...children, ...nested.flat()];
  } catch {
    // pgrep exits 1 when no children found
    return [];
  }
}

/** Check if a session is currently paused */
export function isSessionPaused(name: string): boolean {
  return existsSync(`${PAUSE_DIR}/${name}`);
}

/** Freeze a session's entire process tree with SIGSTOP */
export async function pauseSession(name: string): Promise<void> {
  validateSessionName(name);
  const rootPid = await getPanePid(name);
  if (!rootPid) throw new Error(`Cannot get PID for session: ${name}`);

  // Stop root first to prevent new forks during traversal
  process.kill(rootPid, 'SIGSTOP');
  const descendants = await getDescendants(rootPid);
  for (const pid of descendants) {
    try { process.kill(pid, 'SIGSTOP'); } catch { /* already dead */ }
  }

  // Write marker file
  mkdirSync(PAUSE_DIR, { recursive: true });
  writeFileSync(`${PAUSE_DIR}/${name}`, String(rootPid));
}

/** Thaw a session's entire process tree with SIGCONT */
export async function resumeSession(name: string): Promise<void> {
  validateSessionName(name);
  const rootPid = await getPanePid(name);
  if (!rootPid) throw new Error(`Cannot get PID for session: ${name}`);

  const descendants = await getDescendants(rootPid);
  // Resume all descendants first, then root
  for (const pid of [...descendants, rootPid]) {
    try { process.kill(pid, 'SIGCONT'); } catch { /* already dead */ }
  }

  // Remove marker file
  try { unlinkSync(`${PAUSE_DIR}/${name}`); } catch { /* already removed */ }
}

/** Clean up orphan pause markers on startup — only remove markers for dead sessions.
 *  Intentionally paused sessions stay paused across server restarts. */
export async function cleanupPauseMarkers(): Promise<void> {
  if (!existsSync(PAUSE_DIR)) return;
  for (const name of readdirSync(PAUSE_DIR)) {
    // Check if the tmux session still exists
    try {
      await execFileAsync('tmux', ['has-session', '-t', name]);
      // Session exists and is paused — leave it alone
      console.log(`Paused session preserved: ${name}`);
    } catch {
      // Session no longer exists — remove orphan marker
      try { unlinkSync(`${PAUSE_DIR}/${name}`); } catch { /* ignore */ }
      console.log(`Removed orphan pause marker: ${name}`);
    }
  }
}

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execFileAsync = promisify(execFile);

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateSessionName(name: string): string {
  if (!SESSION_NAME_RE.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
  return name;
}

// Claude Code state driven by hooks (UserPromptSubmit, Stop, Notification, etc.)
export type ClaudeState = 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  workingDir: string;
  lastActivity: string;
  claudeState: ClaudeState;
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
          claudeState: null as ClaudeState,
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

      // Read Claude state from hook-written file (no tmux pane polling needed).
      // State files are written by the notify hook on UserPromptSubmit, Stop, etc.
      try {
        const state = readFileSync(`/tmp/wormhole-claude-state-${session.name}`, 'utf8').trim();
        if (state === 'busy') {
          session.claudeState = 'busy';
        } else if (state === 'permission') {
          session.claudeState = 'permission';
        } else if (state === 'waiting') {
          session.claudeState = 'waiting';
        } else if (state === 'idle') {
          session.claudeState = 'idle';
        } else if (state === 'error') {
          session.claudeState = 'error';
        }
      } catch {
        // no state file — session hasn't triggered hooks yet
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


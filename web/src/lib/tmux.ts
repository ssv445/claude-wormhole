import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

export async function killSession(name: string): Promise<void> {
  validateSessionName(name);
  await execFileAsync('tmux', ['kill-session', '-t', name]);
}

function formatLastActivity(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

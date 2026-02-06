import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  workingDir: string;
}

export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function listSessionsWithInfo(): Promise<SessionInfo[]> {
  try {
    // Format: name|windows|attached|created|path
    const { stdout } = await execAsync(
      'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_path}"'
    );

    const sessions = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, windows, attached, created, sessionPath] = line.split('|');
      return {
        name,
        windows: parseInt(windows, 10),
        attached: attached === '1',
        created: new Date(parseInt(created, 10) * 1000).toLocaleString(),
        workingDir: sessionPath || ''
      };
    });

    // Get current pane path for each session (more accurate than session_path)
    for (const session of sessions) {
      try {
        const { stdout: pathOut } = await execAsync(
          `tmux display-message -p -t "${session.name}" '#{pane_current_path}'`
        );
        session.workingDir = pathOut.trim();
      } catch {
        // Keep session_path as fallback
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

export async function sessionExists(name: string): Promise<boolean> {
  try {
    await execAsync(`tmux has-session -t "${name}"`);
    return true;
  } catch {
    return false;
  }
}

export async function killSession(name: string): Promise<void> {
  await execAsync(`tmux kill-session -t "${name}"`);
}

export async function newSession(name: string, workingDir?: string, command?: string): Promise<void> {
  let cmd = `tmux new-session -d -s "${name}"`;

  if (workingDir) {
    cmd += ` -c "${workingDir}"`;
  }

  if (command) {
    cmd += ` "${command}"`;
  }

  await execAsync(cmd);
}

export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await execAsync('which tmux');
    return true;
  } catch {
    return false;
  }
}

export async function isSeshAvailable(): Promise<boolean> {
  try {
    await execAsync('which sesh');
    return true;
  } catch {
    return false;
  }
}

export async function isTmuxResurrectAvailable(): Promise<boolean> {
  try {
    // Check if resurrect plugin is in tmux plugins directory
    const { stdout } = await execAsync('ls ~/.tmux/plugins/tmux-resurrect 2>/dev/null || ls ~/.config/tmux/plugins/tmux-resurrect 2>/dev/null');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

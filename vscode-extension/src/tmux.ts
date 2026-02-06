import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
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
    // Format: name|windows|attached|created
    const { stdout } = await execAsync(
      'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}"'
    );

    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, windows, attached, created] = line.split('|');
      return {
        name,
        windows: parseInt(windows, 10),
        attached: attached === '1',
        created: new Date(parseInt(created, 10) * 1000).toLocaleString()
      };
    });
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

export async function newSession(name: string, command?: string): Promise<void> {
  const cmd = command
    ? `tmux new-session -d -s "${name}" "${command}"`
    : `tmux new-session -d -s "${name}"`;
  await execAsync(cmd);
}

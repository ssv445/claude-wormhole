import * as vscode from 'vscode';
import * as path from 'path';
import * as tmux from './tmux';

export class TmuxSessionCategory extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly count: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'category';
    this.description = `${count} session${count !== 1 ? 's' : ''}`;
  }
}

export class TmuxDirectoryGroup extends vscode.TreeItem {
  constructor(
    public readonly dirPath: string,
    public readonly sessions: tmux.SessionInfo[]
  ) {
    const displayPath = dirPath.replace(/^\/Users\/[^/]+/, '~');
    const dirName = path.basename(dirPath);

    // Show just directory name, not full path
    super(dirName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'directory';
    this.description = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('symbolIcon.folderForeground'));
    this.tooltip = `Directory: ${displayPath}`;
  }
}

export class TmuxSession extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly windows: number,
    public readonly attached: boolean,
    public readonly created: string,
    public readonly workingDir: string,
    public readonly lastActivity: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    // Clean, minimal description: just time
    this.description = lastActivity;

    const dirDisplay = workingDir
      ? workingDir.replace(/^\/Users\/[^/]+/, '~')
      : '';

    this.tooltip = [
      `Session: ${name}`,
      `Directory: ${dirDisplay || 'N/A'}`,
      `Windows: ${windows}`,
      `Attached: ${attached ? 'Yes' : 'No'}`,
      `Last activity: ${lastActivity}`,
      `Created: ${created}`
    ].join('\n');

    this.contextValue = 'session';

    // Icon based on state
    this.iconPath = new vscode.ThemeIcon(
      attached ? 'vm-running' : 'terminal',
      attached ? new vscode.ThemeColor('terminal.ansiGreen') : undefined
    );

    // Double-click to attach
    this.command = {
      command: 'tmux.attach',
      title: 'Attach',
      arguments: [this]
    };
  }
}

export class TmuxSessionProvider implements vscode.TreeDataProvider<TmuxSessionCategory | TmuxDirectoryGroup | TmuxSession> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TmuxSessionCategory | TmuxDirectoryGroup | TmuxSession | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TmuxSessionCategory | TmuxDirectoryGroup | TmuxSession): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TmuxSessionCategory | TmuxDirectoryGroup | TmuxSession): Promise<(TmuxSessionCategory | TmuxDirectoryGroup | TmuxSession)[]> {
    if (!element) {
      // Root level: show categories (Attached / Available)
      const allSessions = await tmux.listSessionsWithInfo();

      const attachedSessions = allSessions.filter(s => s.attached);
      const availableSessions = allSessions.filter(s => !s.attached);

      const categories: TmuxSessionCategory[] = [];

      if (attachedSessions.length > 0) {
        categories.push(new TmuxSessionCategory('Attached', attachedSessions.length));
      }

      if (availableSessions.length > 0) {
        categories.push(new TmuxSessionCategory('Available', availableSessions.length));
      }

      return categories;
    }

    if (element instanceof TmuxSessionCategory) {
      // Category level: group sessions by directory
      const allSessions = await tmux.listSessionsWithInfo();
      const sessions = element.label === 'Attached'
        ? allSessions.filter(s => s.attached)
        : allSessions.filter(s => !s.attached);

      // Group by working directory
      const dirGroups = new Map<string, tmux.SessionInfo[]>();
      for (const session of sessions) {
        const dir = session.workingDir || 'Unknown';
        if (!dirGroups.has(dir)) {
          dirGroups.set(dir, []);
        }
        dirGroups.get(dir)!.push(session);
      }

      // Convert to directory groups, sorted by directory path
      const groups = Array.from(dirGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dir, sessions]) => new TmuxDirectoryGroup(dir, sessions));

      return groups;
    }

    if (element instanceof TmuxDirectoryGroup) {
      // Directory level: return sessions sorted by name
      return element.sessions
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(info => new TmuxSession(
          info.name,
          info.windows,
          info.attached,
          info.created,
          info.workingDir,
          info.lastActivity
        ));
    }

    // Session level: no children
    return [];
  }
}

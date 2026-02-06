import * as vscode from 'vscode';
import * as path from 'path';
import * as tmux from './tmux';

export class TmuxSessionCategory extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly sessions: tmux.SessionInfo[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'category';
    this.description = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
  }
}

export class TmuxSession extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly windows: number,
    public readonly attached: boolean,
    public readonly created: string,
    public readonly workingDir: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    // Show project name from working directory
    const projectName = workingDir ? path.basename(workingDir) : '';
    const dirDisplay = workingDir
      ? workingDir.replace(/^\/Users\/[^/]+/, '~')
      : '';

    // Only show directory if different from session name
    if (projectName && projectName !== name) {
      this.description = projectName;
    } else {
      this.description = `${windows} window${windows > 1 ? 's' : ''}`;
    }

    this.tooltip = [
      `Session: ${name}`,
      `Directory: ${dirDisplay || 'N/A'}`,
      `Windows: ${windows}`,
      `Attached: ${attached ? 'Yes' : 'No'}`,
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

export class TmuxSessionProvider implements vscode.TreeDataProvider<TmuxSessionCategory | TmuxSession> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TmuxSessionCategory | TmuxSession | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TmuxSessionCategory | TmuxSession): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TmuxSessionCategory | TmuxSession): Promise<(TmuxSessionCategory | TmuxSession)[]> {
    if (!element) {
      // Root level: show categories
      const allSessions = await tmux.listSessionsWithInfo();

      const attachedSessions = allSessions.filter(s => s.attached);
      const availableSessions = allSessions.filter(s => !s.attached);

      const categories: TmuxSessionCategory[] = [];

      if (attachedSessions.length > 0) {
        categories.push(new TmuxSessionCategory('Attached', attachedSessions));
      }

      if (availableSessions.length > 0) {
        categories.push(new TmuxSessionCategory('Available', availableSessions));
      }

      return categories;
    }

    if (element instanceof TmuxSessionCategory) {
      // Category level: return sessions
      return element.sessions
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(info => new TmuxSession(
          info.name,
          info.windows,
          info.attached,
          info.created,
          info.workingDir
        ));
    }

    // Session level: no children
    return [];
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import * as tmux from './tmux';

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

    this.description = projectName || `${windows} window${windows > 1 ? 's' : ''}`;
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

export class TmuxSessionProvider implements vscode.TreeDataProvider<TmuxSession> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TmuxSession | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TmuxSession): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TmuxSession): Promise<TmuxSession[]> {
    if (element) {
      // No children for now (could expand to show windows)
      return [];
    }

    // Root level: list all sessions
    const sessionsInfo = await tmux.listSessionsWithInfo();

    // Sort: attached first, then by name
    sessionsInfo.sort((a, b) => {
      if (a.attached !== b.attached) {
        return a.attached ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return sessionsInfo.map(info => new TmuxSession(
      info.name,
      info.windows,
      info.attached,
      info.created,
      info.workingDir
    ));
  }
}

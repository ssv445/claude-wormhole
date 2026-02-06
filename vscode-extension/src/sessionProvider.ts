import * as vscode from 'vscode';
import * as tmux from './tmux';

export class TmuxSession extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly windows: number,
    public readonly attached: boolean,
    public readonly created: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    this.description = `${windows} window${windows > 1 ? 's' : ''}${attached ? ' • attached' : ''}`;
    this.tooltip = `Created: ${created}\nWindows: ${windows}\nAttached: ${attached ? 'Yes' : 'No'}`;
    this.contextValue = 'session';

    // Icon based on state
    this.iconPath = new vscode.ThemeIcon(
      attached ? 'terminal-tmux' : 'terminal',
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
    return sessionsInfo.map(info => new TmuxSession(
      info.name,
      info.windows,
      info.attached,
      info.created
    ));
  }
}

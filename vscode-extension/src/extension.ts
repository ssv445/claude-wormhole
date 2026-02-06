import * as vscode from 'vscode';
import { TmuxSessionProvider, TmuxSession } from './sessionProvider';
import * as tmux from './tmux';

export async function activate(context: vscode.ExtensionContext) {
  // Check dependencies
  const hasTmux = await tmux.isTmuxAvailable();
  if (!hasTmux) {
    vscode.window.showErrorMessage('tmux is not installed. Please install tmux first.');
    return;
  }

  const hasSesh = await tmux.isSeshAvailable();
  const hasResurrect = await tmux.isTmuxResurrectAvailable();

  if (!hasSesh || !hasResurrect) {
    const missing = [];
    if (!hasSesh) missing.push('sesh');
    if (!hasResurrect) missing.push('tmux-resurrect');

    vscode.window.showWarningMessage(
      `Recommended tools not found: ${missing.join(', ')}. Session persistence may not work.`,
      'Install Guide'
    ).then(selection => {
      if (selection === 'Install Guide') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/joshmedeski/sesh'));
      }
    });
  }

  const sessionProvider = new TmuxSessionProvider();

  // Register tree view
  vscode.window.registerTreeDataProvider('tmuxSessionsView', sessionProvider);

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.refresh', () => {
      sessionProvider.refresh();
    })
  );

  // Attach to session
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.attach', async (session?: TmuxSession) => {
      let sessionName = session?.name;

      if (!sessionName) {
        const sessions = await tmux.listSessions();
        if (sessions.length === 0) {
          vscode.window.showInformationMessage('No tmux sessions found');
          return;
        }
        const picked = await vscode.window.showQuickPick(sessions, {
          placeHolder: 'Select session to attach'
        });
        if (!picked) return;
        sessionName = picked;
      }

      const terminal = vscode.window.createTerminal({
        name: `tmux: ${sessionName}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux attach-session -t "${sessionName}"`]
      });
      terminal.show();
    })
  );

  // New session (always uses tmux directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.new', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Session name',
        placeHolder: 'my-project'
      });
      if (!name) return;

      // Get current workspace folder as working directory
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workingDir = workspaceFolders?.[0]?.uri.fsPath;

      const terminal = vscode.window.createTerminal({
        name: `tmux: ${name}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux new-session -s "${name}"${workingDir ? ` -c "${workingDir}"` : ''}`],
        cwd: workingDir
      });
      terminal.show();

      // Refresh after a short delay to show new session
      setTimeout(() => sessionProvider.refresh(), 500);
    })
  );

  // New session with Claude (always uses tmux directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.newWithClaude', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Session name',
        placeHolder: 'my-project'
      });
      if (!name) return;

      // Get current workspace folder as working directory
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workingDir = workspaceFolders?.[0]?.uri.fsPath;

      const terminal = vscode.window.createTerminal({
        name: `tmux: ${name}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux new-session -s "${name}"${workingDir ? ` -c "${workingDir}"` : ''} "claude; exec $SHELL"`],
        cwd: workingDir
      });
      terminal.show();

      // Refresh after a short delay to show new session
      setTimeout(() => sessionProvider.refresh(), 500);
    })
  );

  // Kill session
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.kill', async (session?: TmuxSession) => {
      let sessionName = session?.name;

      if (!sessionName) {
        const sessions = await tmux.listSessions();
        const picked = await vscode.window.showQuickPick(sessions, {
          placeHolder: 'Select session to kill'
        });
        if (!picked) return;
        sessionName = picked;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Kill session "${sessionName}"?`,
        'Yes', 'No'
      );
      if (confirm !== 'Yes') return;

      await tmux.killSession(sessionName);
      sessionProvider.refresh();
      vscode.window.showInformationMessage(`Session "${sessionName}" killed`);
    })
  );

  // Auto-refresh every 10 seconds
  const refreshInterval = setInterval(() => {
    sessionProvider.refresh();
  }, 10000);

  context.subscriptions.push({
    dispose: () => clearInterval(refreshInterval)
  });
}

export function deactivate() {}

import * as vscode from 'vscode';
import { TmuxSessionProvider, TmuxSession } from './sessionProvider';
import * as tmux from './tmux';

export function activate(context: vscode.ExtensionContext) {
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

  // New session
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.new', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Session name',
        placeHolder: 'my-project'
      });
      if (!name) return;

      const terminal = vscode.window.createTerminal({
        name: `tmux: ${name}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux new-session -s "${name}"`]
      });
      terminal.show();
      sessionProvider.refresh();
    })
  );

  // New session with Claude
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.newWithClaude', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Session name',
        placeHolder: 'my-project'
      });
      if (!name) return;

      const terminal = vscode.window.createTerminal({
        name: `tmux: ${name}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux new-session -s "${name}" "claude; exec $SHELL"`]
      });
      terminal.show();
      sessionProvider.refresh();
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

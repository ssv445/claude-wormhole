import * as vscode from 'vscode';
import { TmuxSessionProvider, TmuxSession } from './sessionProvider';
import * as tmux from './tmux';

// Track terminals for each session
const sessionTerminals = new Map<string, vscode.Terminal>();

export async function activate(context: vscode.ExtensionContext) {
  // Check dependencies
  // Check if tmux is available
  const hasTmux = await tmux.isTmuxAvailable();
  if (!hasTmux) {
    vscode.window.showErrorMessage('tmux is not installed. Please install tmux first.');
    return;
  }

  const sessionProvider = new TmuxSessionProvider();

  // Register tree view
  vscode.window.registerTreeDataProvider('tmuxSessionsView', sessionProvider);

  // Clean up terminal tracking when terminals are closed
  vscode.window.onDidCloseTerminal(terminal => {
    for (const [sessionName, term] of sessionTerminals.entries()) {
      if (term === terminal) {
        sessionTerminals.delete(sessionName);
        break;
      }
    }
  });

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.refresh', () => {
      sessionProvider.refresh();
    })
  );

  // Attach to session (or switch to existing terminal)
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

      // Check if terminal already exists for this session
      const existingTerminal = sessionTerminals.get(sessionName);
      if (existingTerminal) {
        // Switch to existing terminal
        existingTerminal.show();
        return;
      }

      // Create new terminal
      const terminal = vscode.window.createTerminal({
        name: `tmux: ${sessionName}`,
        shellPath: '/bin/bash',
        shellArgs: ['-c', `tmux attach-session -t "${sessionName}"`]
      });

      sessionTerminals.set(sessionName, terminal);
      terminal.show();
    })
  );

  // Detach from session
  context.subscriptions.push(
    vscode.commands.registerCommand('tmux.detach', async (session?: TmuxSession) => {
      let sessionName = session?.name;

      if (!sessionName) {
        // Get all attached sessions
        const allSessions = await tmux.listSessionsWithInfo();
        const attachedSessions = allSessions.filter(s => s.attached).map(s => s.name);

        if (attachedSessions.length === 0) {
          vscode.window.showInformationMessage('No attached sessions');
          return;
        }

        const picked = await vscode.window.showQuickPick(attachedSessions, {
          placeHolder: 'Select session to detach'
        });
        if (!picked) return;
        sessionName = picked;
      }

      // Find and close the terminal
      const terminal = sessionTerminals.get(sessionName);
      if (terminal) {
        terminal.dispose();
        sessionTerminals.delete(sessionName);
      }

      sessionProvider.refresh();
      vscode.window.showInformationMessage(`Detached from session "${sessionName}"`);
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

      sessionTerminals.set(name, terminal);
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

      sessionTerminals.set(name, terminal);
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

      // Close terminal if exists
      const terminal = sessionTerminals.get(sessionName);
      if (terminal) {
        terminal.dispose();
        sessionTerminals.delete(sessionName);
      }

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

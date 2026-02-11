import { createServer } from 'http';
import { parse } from 'url';
import { execFileSync } from 'child_process';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3100', 10);

// Resolve tmux path at startup so node-pty can find it
const TMUX_PATH = (() => {
  try {
    return execFileSync('which', ['tmux']).toString().trim();
  } catch {
    return 'tmux'; // fallback
  }
})();
console.log(`Using tmux at: ${TMUX_PATH}`);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]+$/;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url!, true);

    if (pathname === '/api/terminal') {
      const session = query.session as string;
      if (!session || !SESSION_NAME_RE.test(session)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, session);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, _req: unknown, session: string) => {
    // Lazy-require node-pty so Next.js webpack doesn't try to bundle it
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pty = require('node-pty');

    // Build env with proper PATH for homebrew
    // Explicit type preserves the string index signature from process.env
    const env: Record<string, string | undefined> = { ...process.env, TERM: 'xterm-256color' };
    if (!env.PATH?.includes('/opt/homebrew/bin')) {
      env.PATH = `/opt/homebrew/bin:${env.PATH}`;
    }

    let ptyProcess: ReturnType<typeof pty.spawn>;
    try {
      ptyProcess = pty.spawn(TMUX_PATH, ['-u', 'attach-session', '-t', session], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env,
      });
    } catch (err) {
      console.error('Failed to spawn PTY:', err);
      ws.close(1011, 'PTY spawn failed');
      return;
    }

    console.log(`PTY spawned for session: ${session}, pid: ${ptyProcess.pid}`);

    // Heartbeat — detect dead connections (iOS backgrounding kills WS silently)
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });
    const heartbeat = setInterval(() => {
      if (!isAlive) { ws.terminate(); return; }
      isAlive = false;
      ws.ping();
    }, 30_000);

    // PTY → WebSocket
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Track cleanup state to avoid double-destroy
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      try { ptyProcess.destroy(); } catch { /* already dead */ }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      console.log(`Cleaned up PTY for session: ${session}`);
    };

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      console.log(`PTY exited for session: ${session}, code: ${exitCode}`);
      cleanup();
    });

    // WebSocket → PTY
    ws.on('message', (msg: Buffer | string) => {
      const str = msg.toString();

      // Check for JSON control messages
      if (str.startsWith('{')) {
        try {
          const parsed = JSON.parse(str);
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            ptyProcess.resize(parsed.cols, parsed.rows);
            return;
          }
        } catch {
          // Not JSON, treat as terminal input
        }
      }

      ptyProcess.write(str);
    });

    ws.on('close', cleanup);
    ws.on('error', (err) => {
      console.error(`WebSocket error for session: ${session}:`, err.message);
      cleanup();
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> claude-bridge ready on http://${hostname}:${port}`);
  });
});

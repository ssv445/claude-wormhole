import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WORMHOLE_DIR = join(homedir(), '.wormhole');
export const SESSIONS_FILE = join(WORMHOLE_DIR, 'sessions.json');
const STALE_DAYS = 90;
const STALE_SECONDS = STALE_DAYS * 24 * 60 * 60;
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
export { STALE_SECONDS };

// Serialize all read-modify-write cycles through a promise queue to prevent
// lost-update races when concurrent API requests touch sessions.json.
let writeQueue = Promise.resolve();
function serialized<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = writeQueue.then(fn);
  // Chain but don't propagate errors to subsequent queued operations
  writeQueue = next.then(() => {}, () => {});
  return next;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedSession {
  workingDir: string;
  claudeSessionId: string | null;
  lastSeen: number; // epoch seconds
}

interface SessionsFile {
  version: 1;
  sessions: Record<string, SavedSession>;
}

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

export function readSavedSessions(): Record<string, SavedSession> {
  try {
    const raw = readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SessionsFile;
    return parsed.sessions ?? {};
  } catch (err: unknown) {
    // File genuinely missing → empty set (first run)
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return {};
    }
    // Any other error (permissions, corruption, bad JSON) — refuse to return
    // empty so callers don't overwrite the real file with {}.
    console.error('[sessions] failed to read sessions.json — refusing to return empty:', err);
    throw err;
  }
}

export function writeSavedSessions(sessions: Record<string, SavedSession>): void {
  // Ensure the directory exists before writing
  mkdirSync(WORMHOLE_DIR, { recursive: true });

  const data: SessionsFile = { version: 1, sessions };
  const json = JSON.stringify(data, null, 2);

  // Atomic write: write to .tmp then rename so readers never see partial data
  const tmp = SESSIONS_FILE + '.tmp';
  writeFileSync(tmp, json, 'utf8');
  renameSync(tmp, SESSIONS_FILE);
}

// ---------------------------------------------------------------------------
// Sync (called every 60 s by server.ts)
// ---------------------------------------------------------------------------

/**
 * Refresh metadata for sessions the user has explicitly attached.
 *
 * `sessions.json` is a **curated set** — it contains only sessions the user
 * has chosen to keep as tabs (via `addSavedSession` when the UI attaches
 * one). This function never adds new entries; it only:
 *
 *   1. Updates `workingDir` / `claudeSessionId` / `lastSeen` for existing
 *      entries that are still alive in tmux, so page-reload restoration
 *      has fresh metadata.
 *   2. Prunes entries that have been gone from tmux long enough to exceed
 *      STALE_SECONDS — these are sessions the user killed externally and
 *      never came back.
 *
 * Previously this upserted every live tmux session it saw, which meant
 * auto-open on page reload restored tabs the user hadn't asked for. With
 * many live sessions that blew past Chrome's 16-WebGL-context cap and
 * caused a rendering ping-pong. Curated-set model avoids the whole class.
 */
export function syncSessionsFile(): Promise<void> {
  return serialized(async () => {
    // 1. Read live tmux sessions — these are a lookup, not the source of truth
    const liveEntries: Array<{ name: string; workingDir: string }> = [];
    try {
      const { stdout } = await execFileAsync('tmux', [
        'list-sessions',
        '-F',
        '#{session_name}|#{pane_current_path}',
      ]);
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const sep = line.indexOf('|');
        liveEntries.push({
          name: line.slice(0, sep),
          workingDir: line.slice(sep + 1),
        });
      }
    } catch {
      // tmux not running — no live sessions
    }

    const liveMap = new Map(liveEntries.map((e) => [e.name, e]));

    // 2. Read existing persisted (curated) sessions
    const sessions = readSavedSessions();
    const now = Math.floor(Date.now() / 1000);

    // 3. Refresh metadata for entries that are still live. Do NOT add new
    //    entries for sessions the user hasn't attached.
    for (const name of Object.keys(sessions)) {
      const live = liveMap.get(name);
      if (!live) continue; // gone from tmux — leave lastSeen alone; it'll prune eventually

      let claudeSessionId: string | null = sessions[name].claudeSessionId;
      try {
        const id = readFileSync(`/tmp/wormhole-claude-session-${name}`, 'utf8').trim();
        if (id) claudeSessionId = id;
      } catch {
        // no file yet — keep whatever was persisted
      }

      sessions[name] = {
        workingDir: live.workingDir || sessions[name].workingDir || '',
        claudeSessionId,
        lastSeen: now,
      };
    }

    // 4. Prune entries that are stale AND not currently live
    for (const [name, session] of Object.entries(sessions)) {
      if (!liveMap.has(name) && now - session.lastSeen > STALE_SECONDS) {
        delete sessions[name];
      }
    }

    // 5. Persist
    writeSavedSessions(sessions);
  });
}

// ---------------------------------------------------------------------------
// Add (explicit attach)
// ---------------------------------------------------------------------------

/**
 * Add a session to the curated set. Called when the user explicitly attaches
 * a detached session via the UI. If the session isn't live in tmux, this is
 * a no-op (nothing to persist).
 */
export function addSavedSession(name: string): Promise<void> {
  return serialized(async () => {
    // Validate name before interpolating into a tmux command
    if (!SAFE_NAME_RE.test(name)) return;

    // Look up the live tmux session to grab workingDir
    let workingDir = '';
    try {
      const { stdout } = await execFileAsync('tmux', [
        'display-message',
        '-p',
        '-t',
        name,
        '#{pane_current_path}',
      ]);
      workingDir = stdout.trim();
    } catch {
      // Session not live — nothing to persist
      return;
    }

    // Pick up any cached Claude session id that the statusline hook wrote
    let claudeSessionId: string | null = null;
    try {
      const id = readFileSync(`/tmp/wormhole-claude-session-${name}`, 'utf8').trim();
      if (id) claudeSessionId = id;
    } catch {
      // no file — leave as null
    }

    const sessions = readSavedSessions();
    sessions[name] = {
      workingDir,
      claudeSessionId,
      lastSeen: Math.floor(Date.now() / 1000),
    };
    writeSavedSessions(sessions);
  });
}

// ---------------------------------------------------------------------------
// Trash (soft-delete) helpers
// ---------------------------------------------------------------------------

const TRASH_FILE = join(WORMHOLE_DIR, 'sessions.trash.json');

interface TrashedSession extends SavedSession {
  trashedAt: number; // epoch seconds
  tmuxName: string;  // original tmux session name (key for restore)
}

interface TrashFile {
  version: 1;
  sessions: TrashedSession[];
}

const TRASH_MAX_DAYS = 90;
const TRASH_MAX_SECONDS = TRASH_MAX_DAYS * 24 * 60 * 60;

function readTrash(): TrashedSession[] {
  try {
    const raw = readFileSync(TRASH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as TrashFile;
    return parsed.sessions ?? [];
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    console.error('[sessions] failed to read trash file:', err);
    return []; // trash is non-critical — don't throw
  }
}

function writeTrash(sessions: TrashedSession[]): void {
  mkdirSync(WORMHOLE_DIR, { recursive: true });
  const data: TrashFile = { version: 1, sessions };
  const tmp = TRASH_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, TRASH_FILE);
}

function trashSession(name: string, session: SavedSession): void {
  const trash = readTrash();
  const now = Math.floor(Date.now() / 1000);

  // Prune entries older than 90 days while we're here
  const fresh = trash.filter((t) => now - t.trashedAt < TRASH_MAX_SECONDS);

  fresh.push({
    ...session,
    tmuxName: name,
    trashedAt: now,
  });

  writeTrash(fresh);
  console.log(`[sessions] trashed "${name}" (claudeSessionId: ${session.claudeSessionId ?? 'none'})`);
}

/** List trashed sessions (for UI recovery picker). */
export function listTrashedSessions(): TrashedSession[] {
  const now = Math.floor(Date.now() / 1000);
  return readTrash().filter((t) => now - t.trashedAt < TRASH_MAX_SECONDS);
}

/** Restore a trashed session back into the curated set. */
export function restoreTrashedSession(tmuxName: string): Promise<void> {
  return serialized(() => {
    const trash = readTrash();
    const idx = trash.findIndex((t) => t.tmuxName === tmuxName);
    if (idx === -1) return;

    const entry = trash[idx];
    trash.splice(idx, 1);
    writeTrash(trash);

    const sessions = readSavedSessions();
    sessions[tmuxName] = {
      workingDir: entry.workingDir,
      claudeSessionId: entry.claudeSessionId,
      lastSeen: Math.floor(Date.now() / 1000),
    };
    writeSavedSessions(sessions);
    console.log(`[sessions] restored "${tmuxName}" from trash`);
  });
}

// ---------------------------------------------------------------------------
// Remove / Rename
// ---------------------------------------------------------------------------

/**
 * Remove a session from the curated set.
 * @param moveToTrash — true when killing (DELETE), false when detaching (PATCH
 *   detach). Detach just hides the tab; the tmux session is still alive, so
 *   there's nothing to recover — no trash needed.
 */
export function removeSavedSession(name: string, moveToTrash = false): Promise<void> {
  return serialized(() => {
    const sessions = readSavedSessions();
    const entry = sessions[name];

    // Only trash on kill — detach is a view concept, session stays alive
    if (moveToTrash && entry) {
      trashSession(name, entry);
    }

    delete sessions[name];
    writeSavedSessions(sessions);

    // Clean up associated temp files (best-effort)
    for (const suffix of ['session', 'state']) {
      try {
        unlinkSync(`/tmp/wormhole-claude-${suffix}-${name}`);
      } catch {
        // file may not exist — ignore
      }
    }
  });
}

export function renameSavedSession(oldName: string, newName: string): Promise<void> {
  return serialized(() => {
    const sessions = readSavedSessions();
    if (!(oldName in sessions)) return;

    sessions[newName] = sessions[oldName];
    delete sessions[oldName];
    writeSavedSessions(sessions);
  });
}

// ---------------------------------------------------------------------------
// Resurrect a dead tmux session
// ---------------------------------------------------------------------------

// In-memory mutex: names currently being resurrected
const resurrecting = new Set<string>();

export async function resurrectSession(
  name: string,
  session: SavedSession,
): Promise<boolean> {
  // Prevent concurrent resurrection of the same session
  if (resurrecting.has(name)) return true; // already in progress — signal "being handled"
  resurrecting.add(name);

  try {
    // Validate session name to prevent unexpected tmux behavior
    if (!SAFE_NAME_RE.test(name)) return false;

    // Validate claudeSessionId format before interpolating into shell command
    if (session.claudeSessionId && !SAFE_NAME_RE.test(session.claudeSessionId)) {
      session.claudeSessionId = null;
    }

    // Skip resurrection if cwd is gone (external drive not mounted, worktree
    // deleted, etc.) but do NOT remove the entry — it's the user's curated
    // set and the directory may come back. Entry costs nothing to keep.
    if (!existsSync(session.workingDir)) {
      console.warn(`[resurrect] skipping "${name}" — workingDir missing: ${session.workingDir}`);
      return false;
    }

    // Create a new detached tmux session rooted at the original working dir
    await execFileAsync('tmux', [
      'new-session',
      '-d',
      '-s',
      name,
      '-c',
      session.workingDir,
    ]);

    // Launch Claude Code inside the session
    const cldCmd = session.claudeSessionId
      ? `cld --resume ${session.claudeSessionId}`
      : 'cld';

    await execFileAsync('tmux', [
      'send-keys',
      '-t',
      name,
      cldCmd,
      'Enter',
    ]);

    return true;
  } catch {
    return false;
  } finally {
    resurrecting.delete(name);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { listSessionsWithInfo, newSession, killSession, renameSession, restartClaudeSession } from '@/lib/tmux';
import { removeSavedSession, renameSavedSession, readSavedSessions, resurrectSession, STALE_SECONDS } from '@/lib/sessions';

export async function GET() {
  try {
    const [sessions, saved] = await Promise.all([
      listSessionsWithInfo(),
      Promise.resolve(readSavedSessions()),
    ]);

    const liveNames = new Set(sessions.map((s) => s.name));

    // Mark live sessions that are in the saved file
    for (const s of sessions) {
      if (saved[s.name]) {
        s.saved = true;
      }
    }

    // Resurrect dead sessions that are in the saved file.
    // Fire-and-forget — don't block the response on resurrection completing.
    const now = Math.floor(Date.now() / 1000);

    for (const [name, entry] of Object.entries(saved)) {
      if (liveNames.has(name)) continue;
      if (entry.lastSeen < now - STALE_SECONDS) continue;

      // Launch resurrection in background (mutex prevents double-spawn)
      resurrectSession(name, entry).catch(() => {});

      // Include in response immediately so frontend opens the tab
      sessions.push({
        name,
        windows: 1,
        attached: false,
        created: new Date().toLocaleString(),
        workingDir: entry.workingDir,
        lastActivity: 'just now',
        claudeState: null,
        saved: true,
        restored: true,
        restoring: !!entry.claudeSessionId,
      });
    }

    return NextResponse.json(sessions);
  } catch {
    // Graceful fallback — return empty list so frontend doesn't crash
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const { name, workingDir } = await req.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    await newSession(name, workingDir);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  // Restart Claude Code inside the tmux session
  if (body.action === 'restart') {
    const { name } = body;
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    try {
      await restartClaudeSession(name);
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restart session';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Rename action

  const { oldName, newName } = body;
  if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
    return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 });
  }
  try {
    await renameSession(oldName, newName);
    await renameSavedSession(oldName, newName);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to rename session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    await killSession(name);
    await removeSavedSession(name);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to kill session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

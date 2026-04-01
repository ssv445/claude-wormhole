import { NextRequest, NextResponse } from 'next/server';
import { listSessionsWithInfo, newSession, killSession, renameSession, restartClaudeSession } from '@/lib/tmux';
import { removeSavedSession, renameSavedSession } from '@/lib/sessions';

export async function GET() {
  const sessions = await listSessionsWithInfo();
  return NextResponse.json(sessions);
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
    renameSavedSession(oldName, newName);
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
    removeSavedSession(name);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to kill session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

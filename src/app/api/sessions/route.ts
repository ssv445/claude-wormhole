import { NextRequest, NextResponse } from 'next/server';
import { listSessionsWithInfo, newSession, killSession, renameSession, pauseSession, resumeSession } from '@/lib/tmux';

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

  // Pause/resume actions
  if (body.action === 'pause' || body.action === 'resume') {
    const { name } = body;
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    try {
      if (body.action === 'pause') {
        await pauseSession(name);
      } else {
        await resumeSession(name);
      }
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Failed to ${body.action} session`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Rename action (existing)
  const { oldName, newName } = body;
  if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
    return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 });
  }
  try {
    await renameSession(oldName, newName);
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
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to kill session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

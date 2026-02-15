import { NextRequest, NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push';

// Dedup: only notify when the state changes per session.
// e.g. idle→idle is suppressed, idle→stop→idle sends both stop and idle.
const lastTypePerSession = new Map<string, string>();

function isDuplicate(type: string, session: string): boolean {
  const lastType = lastTypePerSession.get(session);

  if (lastType === type) {
    return true;
  }

  lastTypePerSession.set(session, type);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { type, message, session } = await req.json();

    const notifyType = type || 'notify';
    const notifySession = session || '';

    if (isDuplicate(notifyType, notifySession)) {
      console.log(`[notify] deduped ${notifyType}:${notifySession}`);
      return NextResponse.json({ ok: true, deduped: true });
    }

    console.log(`[notify] sending ${notifyType}:${notifySession}`);

    const label =
      type === 'permission'
        ? 'Permission needed'
        : type === 'idle'
          ? 'Claude waiting'
          : type === 'stop'
            ? 'Task complete'
            : 'Claude Wormhole';

    const title = session ? `${session} — ${label}` : label;

    await sendPushToAll({
      title,
      body: message || `Claude needs attention${session ? ` in ${session}` : ''}`,
      session,
      tag: `tmux-${type || 'notify'}`,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

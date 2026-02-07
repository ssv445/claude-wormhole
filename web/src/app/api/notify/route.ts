import { NextRequest, NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push';

// Dedup: only send one notification per type+session within this window
const DEDUP_WINDOW_MS = 5 * 60_000; // 5 minutes
const recentNotifications = new Map<string, number>();

function isDuplicate(type: string, session: string): boolean {
  const key = `${type}:${session}`;
  const lastSent = recentNotifications.get(key);
  const now = Date.now();

  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }

  recentNotifications.set(key, now);

  // Prune old entries to avoid unbounded growth
  if (recentNotifications.size > 100) {
    for (const [k, t] of recentNotifications) {
      if (now - t > DEDUP_WINDOW_MS) recentNotifications.delete(k);
    }
  }

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
            : 'Claude Bridge';

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

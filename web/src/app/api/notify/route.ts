import { NextRequest, NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    const { type, message, session } = await req.json();

    const title =
      type === 'permission'
        ? 'Permission needed'
        : type === 'idle'
          ? 'Claude waiting'
          : type === 'stop'
            ? 'Task complete'
            : 'Claude Bridge';

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

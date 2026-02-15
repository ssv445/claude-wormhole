import { NextRequest, NextResponse } from 'next/server';
import { addSubscription } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription' },
        { status: 400 }
      );
    }
    addSubscription(sub);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}

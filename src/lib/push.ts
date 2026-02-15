import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const SUBS_FILE = join(DATA_DIR, 'subscriptions.json');

// Initialize VAPID from env
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

// VAPID subject: mailto: or https:// URL identifying the server operator.
// Apple Push rejects invalid subjects (e.g. mailto:x@localhost).
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || '';

if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSubscriptions(): PushSubscription[] {
  ensureDataDir();
  if (!existsSync(SUBS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SUBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSubscriptions(subs: PushSubscription[]) {
  ensureDataDir();
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

export function addSubscription(sub: PushSubscription) {
  const subs = loadSubscriptions();
  // Deduplicate by endpoint
  const filtered = subs.filter((s) => s.endpoint !== sub.endpoint);
  filtered.push(sub);
  saveSubscriptions(filtered);
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  session?: string;
  tag?: string;
}) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    console.warn('VAPID not configured (need VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)');
    return;
  }

  const subs = loadSubscriptions();
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // 410 Gone or 404 = subscription expired
        if (status === 410 || status === 404) {
          expired.push(sub.endpoint);
        }
      }
    })
  );

  // Remove expired subscriptions
  if (expired.length > 0) {
    const remaining = subs.filter((s) => !expired.includes(s.endpoint));
    saveSubscriptions(remaining);
  }
}

'use client';

import { useEffect, useState } from 'react';

export function PushRegistrar() {
  const [state, setState] = useState<'loading' | 'prompt' | 'subscribed' | 'denied' | 'unsupported'>('loading');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    // Auto-reload when a new service worker takes over (e.g. after deploy).
    // This ensures the page always runs with the latest SW + cache.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });

    async function check() {
      try {
        // updateViaCache: 'none' bypasses HTTP cache for sw.js on iOS
        const reg = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });
        // Force iOS PWA to check for new SW on every launch
        reg.update().catch(() => {});
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-sync subscription to server on every load.
          // FCM/Apple tokens can rotate silently — pushing the current
          // subscription ensures the server always has a valid endpoint.
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existing.toJSON()),
          }).catch(() => {});
          setState('subscribed');
        } else {
          setState('prompt');
        }
      } catch {
        setState('unsupported');
      }
    }

    check();
  }, []);

  // iOS requires Notification.requestPermission() from a user gesture (button tap).
  // Auto-calling it on mount silently fails on iOS PWAs.
  async function subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });

      setState('subscribed');
    } catch (err) {
      console.warn('Push subscription failed:', err);
      setState('denied');
    }
  }

  // Only show the subscribe banner when permission hasn't been granted yet
  if (state !== 'prompt') return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="bg-surface border border-border rounded-lg p-3 shadow-lg flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Enable notifications?</p>
          <p className="text-xs text-muted">Get alerted when Claude needs input</p>
        </div>
        <button
          onClick={subscribe}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors shrink-0"
        >
          Enable
        </button>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getViewport, type ViewportState } from '@/lib/viewport';

export type { ViewportState };

export function useViewport(): ViewportState {
  return useSyncExternalStore(subscribe, getViewport, getViewport);
}

# Viewport Monitor Design

| Field | Value |
|-------|-------|
| **Date** | 2026-03-27 |
| **Status** | Approved |
| **Scope** | Replace scattered viewport/keyboard/PWA detection with single module |

## Problem

Viewport logic is scattered across 4 files (page.tsx, TerminalView.tsx, Sidebar.tsx, globals.css) with duplicated state, prop drilling, and race conditions. The `translateY` keyboard approach leaves visible gaps when keyboard dismisses during scroll.

## Solution

Two files following the Telegram/Ionic production PWA pattern:

### `src/lib/viewport.ts` — Plain JS module

Single event listener. Sets CSS custom properties on `:root`. Exposes state via `useSyncExternalStore`-compatible API.

**CSS vars set on `:root`:**

| Variable | Value |
|---|---|
| `--vh` | `visualViewport.height` px (shrinks when keyboard opens) |
| `--kb-height` | keyboard height px (0 when closed) |
| `--safe-bottom` | `env(safe-area-inset-bottom)` when kb closed, `0px` when open |

**JS state returned by `getViewport()`:**

```typescript
interface ViewportState {
  keyboardOpen: boolean;       // innerHeight - vv.height > 150px
  keyboardHeight: number;      // px (0 when closed)
  availableHeight: number;     // visualViewport.height
  isMobile: boolean;           // width < 768
  isIOS: boolean;              // iPad/iPhone/iPod (computed once)
  isPWA: boolean;              // standalone mode (computed once)
  isFullscreen: boolean;       // Fullscreen API state
  orientation: 'portrait' | 'landscape';
}
```

**Keyboard detection:** `window.innerHeight - visualViewport.height > 150` with `scale` check (Ionic pattern). Keyboard close delayed 100ms to let Safari settle.

**Listeners:** `visualViewport.resize`, `visualViewport.scroll`, `orientationchange`, `fullscreenchange`, `window.resize` (fallback).

**Exports:** `subscribe(callback)`, `getViewport()`, `toggleFullscreen()`, `initViewport()`.

### `src/hooks/useViewport.ts` — Thin React hook

```typescript
import { useSyncExternalStore } from 'react';
import { subscribe, getViewport } from '@/lib/viewport';

export function useViewport() {
  return useSyncExternalStore(subscribe, getViewport, getViewport);
}
```

### Key architectural change

**Before:** Container full height + `translateY(-keyboardHeight)` shift. Causes bottom gap on keyboard dismiss.

**After:** Container `height: var(--vh)`. When keyboard opens, `--vh` shrinks, container shrinks, terminal refits naturally via ResizeObserver. No transform, no transition, no gap.

### Consumer changes

| Current | Replaced by |
|---|---|
| `useFullscreen()` hook in page.tsx | `useViewport()` + `toggleFullscreen()` from viewport module |
| `nativeKeyboardHeight` state + visualViewport effect | `useViewport().keyboardHeight` / `var(--vh)` |
| `mainAreaStyle` with `translateY` transform | `style={{ height: 'var(--vh)' }}` |
| `nativeKeyboardHeight` prop to TerminalView | `useViewport()` called directly |
| `isMobile` check via `window.innerWidth` | `useViewport().isMobile` |
| `isIOS`/`isPWA` props drilled to Sidebar | `useViewport()` called directly |
| Conditional `env(safe-area-inset-bottom)` in TerminalView | `var(--safe-bottom)` in CSS |
| `KEYBOARD_TRANSITION` constant | Removed — no transform needed |

### What stays in CSS only

- `env(safe-area-inset-top)` — used directly in CSS, no JS read needed
- `env(safe-area-inset-bottom)` — mapped to `--safe-bottom` by the module
- `viewport-fit=cover` meta tag — unchanged

### Files modified

- **New:** `src/lib/viewport.ts`, `src/hooks/useViewport.ts`
- **Modified:** `src/app/page.tsx` (remove useFullscreen, nativeKeyboardHeight, mainAreaStyle, KEYBOARD_TRANSITION, simplify Sidebar props)
- **Modified:** `src/components/Sidebar.tsx` (remove viewport props, call useViewport directly)
- **Modified:** `src/components/TerminalView.tsx` (remove nativeKeyboardHeight prop, use useViewport + CSS vars)
- **Modified:** `src/app/globals.css` (use --vh, --safe-bottom vars)
- **Tests:** Update keyboard-layout tests to mock the viewport module instead of visualViewport directly

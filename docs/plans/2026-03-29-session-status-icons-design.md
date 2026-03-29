# Session Status Icons — Design Spec

## Problem

The current session status display in the sidebar has UX issues:
1. No visual distinction between sessions open in a browser tab (attached) vs not
2. Color coding is counterintuitive — green for working, grey for idle/done feels backwards
3. Plain colored dots don't communicate state clearly enough at a glance

## Solution

Replace colored dots with animated SMIL SVG icons. Each Claude state gets a distinct shape, color, and animation. Detached sessions are visually dimmed.

## Status Icon Mapping

| State | Icon Shape | Color | Animation | Label |
|---|---|---|---|---|
| busy | Spinning arc (partial circle) | `text-blue-400` | SMIL rotate, 0.8s infinite | "working" |
| permission | Warning triangle | `text-yellow-400` | SMIL opacity pulse 1-0.4-1, 1.2s | "permission" |
| waiting | Prompt cursor `>` | `text-amber-400` | SMIL opacity blink 1-0.3-1, 1.5s | "input needed" |
| idle | Checkmark | `text-green-400` | None (static) | "idle" |
| error | X in circle | `text-red-400` | None (static) | "error" |
| null (unknown) | Hollow circle | `text-muted` | None | (no label) |

### Design Principles

- **Actionable states are prominent**: permission (yellow pulse) and waiting (amber blink) grab attention
- **Informational states are calm**: working (steady spin), idle (static green check)
- **Error is abrupt, not animated**: stable red demands attention through color alone
- **Green = done/success**: matches universal UX conventions

### Detached Treatment

Sessions not open in a browser tab get both:
- **40% opacity** on the icon
- **Dashed SVG strokes** (`stroke-dasharray`) where the icon uses strokes

This makes it immediately clear which sessions you're actively connected to.

## Implementation

### New Component

`src/components/StatusIcon.tsx` — a single component:
```tsx
interface StatusIconProps {
  state: 'busy' | 'waiting' | 'permission' | 'idle' | 'error' | null;
  attached: boolean; // true if session has an open browser tab
  size?: number;     // default 14
}
```

Uses inline SVGs with SMIL `<animateTransform>` and `<animate>` elements. Zero dependencies.

### Changes to Existing Files

**`src/components/SessionList.tsx`**:
- Remove `dotClass()` and `dotTitle()` helpers
- Replace the `<span className="w-2 h-2 rounded-full ...">` with `<StatusIcon>`
- Pass `attached={openTabs.includes(s.name)}` to the icon
- Update text labels to match new naming ("input needed" instead of "waiting")

**`src/lib/tmux.ts`**:
- Add `'permission'` to the `ClaudeState` type union (currently mapped to `'busy'`)
- Read "permission" from state file as its own state instead of collapsing to "busy"

**`src/components/SessionList.tsx` (interface)**:
- Add `'permission'` to `claudeState` type in `SessionInfo`

### No Changes Needed

- `bin/wormhole` already writes "permission" to state files — just not read as a distinct state
- No new dependencies
- No changes to polling interval or API

## States Requiring Backend Change

The `permission` state is currently collapsed into `busy` in `tmux.ts:76`:
```ts
if (state === 'busy' || state === 'permission') {
  session.claudeState = 'busy';
}
```
Change to treat `'permission'` as its own state so the UI can show the yellow triangle.

## Icon Size and Placement

- Icons render at 14px (matching the current dot's visual footprint)
- Same position: left of session name, vertically centered
- Text labels remain below the name alongside the activity timestamp

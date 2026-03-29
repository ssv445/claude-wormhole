# Session Status Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain colored dots in the session sidebar with animated SMIL SVG icons that clearly communicate Claude's state and whether a session is connected.

**Architecture:** Create a `StatusIcon` React component with inline SMIL SVGs for each state (busy, permission, waiting, idle, error, unknown). Update the backend type to expose `permission` as a distinct state. Integrate into `SessionList` replacing the current dot + label rendering.

**Tech Stack:** React, inline SVG with SMIL animations, Tailwind CSS, TypeScript

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/StatusIcon.tsx` | Create | SVG icon component — renders the right icon/animation for each state, handles attached/detached styling |
| `src/lib/tmux.ts` | Modify | Add `'permission'` to `ClaudeState` type, read it as distinct state from state files |
| `src/components/SessionList.tsx` | Modify | Replace dot/label rendering with `StatusIcon`, remove `dotClass()`/`dotTitle()`, update label text |

---

### Task 1: Add `permission` to ClaudeState type

**Files:**
- Modify: `src/lib/tmux.ts:17` (type definition)
- Modify: `src/lib/tmux.ts:74-84` (state file reading)

- [ ] **Step 1: Update the ClaudeState type to include 'permission'**

In `src/lib/tmux.ts`, change line 17 from:
```ts
export type ClaudeState = 'busy' | 'waiting' | 'idle' | 'error' | null;
```
to:
```ts
export type ClaudeState = 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;
```

- [ ] **Step 2: Read 'permission' as its own state instead of collapsing to 'busy'**

In `src/lib/tmux.ts`, change the state file reading block (lines 74-84) from:
```ts
        if (state === 'busy' || state === 'permission') {
          session.claudeState = 'busy';
        } else if (state === 'waiting') {
```
to:
```ts
        if (state === 'busy') {
          session.claudeState = 'busy';
        } else if (state === 'permission') {
          session.claudeState = 'permission';
        } else if (state === 'waiting') {
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /Users/shyam/www/claude-wormhole && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors in `SessionList.tsx` because its local `SessionInfo` interface doesn't include `'permission'` yet. That's expected — we fix it in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tmux.ts
git commit -m "feat: expose 'permission' as distinct ClaudeState"
```

---

### Task 2: Create StatusIcon component

**Files:**
- Create: `src/components/StatusIcon.tsx`

- [ ] **Step 1: Create the StatusIcon component with all 6 states**

Create `src/components/StatusIcon.tsx`:

```tsx
// Animated SVG status icons for Claude session states.
// Uses SMIL animations (zero JS cost, native browser support).
// Detached sessions get dashed strokes + reduced opacity.

interface StatusIconProps {
  state: 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;
  attached: boolean;
  size?: number;
}

export function StatusIcon({ state, attached, size = 14 }: StatusIconProps) {
  const detachedStyle = !attached ? { opacity: 0.4 } : undefined;
  const dash = !attached ? '2 2' : undefined;

  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, ...detachedStyle }}
      title={stateTitle(state)}
    >
      {renderIcon(state, size, dash)}
    </span>
  );
}

function stateTitle(state: StatusIconProps['state']): string {
  switch (state) {
    case 'busy':       return 'Working';
    case 'permission': return 'Needs permission';
    case 'waiting':    return 'Waiting for input';
    case 'idle':       return 'Idle';
    case 'error':      return 'Error';
    default:           return 'Unknown';
  }
}

function renderIcon(state: StatusIconProps['state'], size: number, dash?: string) {
  switch (state) {
    case 'busy':
      return <SpinnerIcon size={size} dash={dash} />;
    case 'permission':
      return <TriangleIcon size={size} dash={dash} />;
    case 'waiting':
      return <PromptIcon size={size} dash={dash} />;
    case 'idle':
      return <CheckIcon size={size} dash={dash} />;
    case 'error':
      return <ErrorIcon size={size} dash={dash} />;
    default:
      return <UnknownIcon size={size} dash={dash} />;
  }
}

// Busy: spinning arc — partial circle rotates continuously.
// The arc is created by strokeDasharray="28 10" (28px visible, 10px gap on a ~37.7px circumference).
// For detached sessions, we layer dashed strokes on top of the arc by combining both patterns.
function SpinnerIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle
        cx="8" cy="8" r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="28 10"
        strokeLinecap="round"
        className="text-blue-400"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>
      {/* Detached overlay: dashed ring on top to show disconnected state */}
      {dash && (
        <circle
          cx="8" cy="8" r="6"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray={dash}
          className="text-blue-400"
          opacity="0.6"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}

// Permission: warning triangle with gentle pulse
function TriangleIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-yellow-400">
      <path
        d="M8 2L14.5 13H1.5L8 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray={dash}
        fill="none"
      >
        <animate
          attributeName="opacity"
          values="1;0.4;1"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </path>
      {/* Exclamation dot */}
      <line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
      </line>
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// Waiting: prompt cursor > with slow blink
function PromptIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-amber-400">
      <path
        d="M4 3L11 8L4 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
      >
        <animate
          attributeName="opacity"
          values="1;0.3;1"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

// Idle/Done: static checkmark
function CheckIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-green-400">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

// Error: static X
function ErrorIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-red-400">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dash} />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

// Unknown: hollow circle
function UnknownIcon({ size, dash }: { size: number; dash?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-muted">
      <circle
        cx="8" cy="8" r="5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={dash ?? undefined}
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify file compiles in isolation**

Run: `cd /Users/shyam/www/claude-wormhole && npx tsc --noEmit src/components/StatusIcon.tsx 2>&1 | head -10`
Expected: No errors (or only errors about missing module resolution which is fine for isolated check).

- [ ] **Step 3: Commit**

```bash
git add src/components/StatusIcon.tsx
git commit -m "feat: add StatusIcon component with SMIL animated SVGs"
```

---

### Task 3: Integrate StatusIcon into SessionList

**Files:**
- Modify: `src/components/SessionList.tsx:5-13` (interface + import)
- Modify: `src/components/SessionList.tsx:222-241` (remove dotClass/dotTitle)
- Modify: `src/components/SessionList.tsx:260-298` (renderSession icon + labels)

- [ ] **Step 1: Add import and update SessionInfo interface**

At the top of `src/components/SessionList.tsx`, add the import after line 3:
```tsx
import { StatusIcon } from '@/components/StatusIcon';
```

Update the `claudeState` type in the `SessionInfo` interface (line 12) from:
```ts
  claudeState: 'busy' | 'waiting' | 'idle' | 'error' | null;
```
to:
```ts
  claudeState: 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;
```

- [ ] **Step 2: Remove dotClass and dotTitle helpers**

Delete the `dotClass` function (lines 223-231) and the `dotTitle` function (lines 233-241). These are replaced by `StatusIcon`.

The code to remove:
```ts
  const dotClass = (s: SessionInfo) => {
    switch (s.claudeState) {
      case 'busy':    return 'bg-green-400 animate-pulse';
      case 'waiting': return 'bg-yellow-400';
      case 'error':   return 'bg-red-400';
      case 'idle':
      default:        return 'border border-muted bg-transparent';
    }
  };

  const dotTitle = (s: SessionInfo) => {
    switch (s.claudeState) {
      case 'busy':    return 'Working';
      case 'waiting': return 'Waiting for input';
      case 'error':   return 'Error';
      case 'idle':    return 'Idle';
      default:        return 'Unknown';
    }
  };
```

- [ ] **Step 3: Replace the dot span with StatusIcon in renderSession**

In `renderSession`, replace the status dot span (line 262-265):
```tsx
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${dotClass(s)}`}
              title={dotTitle(s)}
            />
```
with:
```tsx
            <StatusIcon
              state={s.claudeState}
              attached={openTabs.includes(s.name)}
            />
```

- [ ] **Step 4: Update the text labels to match new state names**

Replace the label block (lines 286-298):
```tsx
            {s.claudeState === 'busy' && (
              <span className="text-green-400" title="Working">working</span>
            )}
            {s.claudeState === 'waiting' && (
              <span className="text-yellow-400" title="Waiting for input">waiting</span>
            )}
            {s.claudeState === 'idle' && (
              <span className="text-muted" title="Idle">idle</span>
            )}
            {s.claudeState === 'error' && (
              <span className="text-red-400" title="Error">error</span>
            )}
```
with:
```tsx
            {s.claudeState === 'busy' && (
              <span className="text-blue-400">working</span>
            )}
            {s.claudeState === 'permission' && (
              <span className="text-yellow-400">permission</span>
            )}
            {s.claudeState === 'waiting' && (
              <span className="text-amber-400">input needed</span>
            )}
            {s.claudeState === 'idle' && (
              <span className="text-green-400">idle</span>
            )}
            {s.claudeState === 'error' && (
              <span className="text-red-400">error</span>
            )}
```

- [ ] **Step 5: Verify build compiles**

Run: `cd /Users/shyam/www/claude-wormhole && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/SessionList.tsx
git commit -m "feat: replace status dots with animated SVG icons in session list"
```

---

### Task 4: Build verification and visual test

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

Run: `cd /Users/shyam/www/claude-wormhole && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Visual verification in browser**

Start dev server if not running:
Run: `cd /Users/shyam/www/claude-wormhole && npm run dev`

Open the app in the browser and verify:
1. Sessions with `busy` state show a blue spinning arc + "working" label
2. Sessions with `permission` state show a yellow pulsing triangle + "permission" label
3. Sessions with `waiting` state show an amber blinking `>` + "input needed" label
4. Sessions with `idle` state show a green static checkmark + "idle" label
5. Sessions with `error` state show a red static X-circle + "error" label
6. Sessions with no state (null) show a grey hollow circle + no label
7. Detached sessions (not open in a tab) have dimmed icons (40% opacity) with dashed strokes
8. Attached sessions (open in a tab) have full-opacity icons with solid strokes

To test different states, manually write state files:
```bash
echo "busy" > /tmp/wormhole-claude-state-<session-name>
echo "permission" > /tmp/wormhole-claude-state-<session-name>
echo "waiting" > /tmp/wormhole-claude-state-<session-name>
echo "idle" > /tmp/wormhole-claude-state-<session-name>
echo "error" > /tmp/wormhole-claude-state-<session-name>
```
Wait 5 seconds (polling interval) and verify each icon appears correctly in the sidebar.

- [ ] **Step 3: Verify detached treatment**

1. Open a session by clicking it (attaches it to a tab)
2. Observe the icon is full opacity with solid strokes
3. Look at other sessions not opened — they should appear dimmed with dashed strokes
4. Detach the session via the dropdown menu
5. Verify the icon dims and strokes become dashed

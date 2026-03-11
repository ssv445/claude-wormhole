# Session Dropdown Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace inline session action buttons with a `⋮` dropdown menu for better mobile UX.

**Architecture:** Single component change in SessionList.tsx. Add a dropdown menu component inline, manage open/close state with React useState + useEffect for outside clicks + Escape key. Add `onKill` prop for kill action. No new dependencies.

**Tech Stack:** React, Tailwind CSS

---

### Task 1: Add onKill prop and kill handler

**Files:**
- Modify: `src/components/SessionList.tsx:16-34` (props interface)
- Modify: `src/app/page.tsx` (pass onKill prop)

**Step 1: Add onKill to SessionList props**

In `SessionList.tsx`, add `onKill` to the props interface and destructuring:

```tsx
// Add to props type (after onRename)
onKill?: (name: string) => void;

// Add to destructuring
onKill,
```

**Step 2: Add kill handler in page.tsx**

```tsx
const killSession = async (name: string) => {
  try {
    await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    detachSession(name);
    setRefreshKey((k) => k + 1);
  } catch { /* silent */ }
};
```

Pass it to SessionList: `onKill={killSession}`

**Step 3: Commit**

```bash
git add src/components/SessionList.tsx src/app/page.tsx
git commit -m "feat: add onKill prop to SessionList"
```

---

### Task 2: Add dropdown menu state and component

**Files:**
- Modify: `src/components/SessionList.tsx:35-41` (state)
- Modify: `src/components/SessionList.tsx:218-331` (renderSession)

**Step 1: Replace confirmingPause state with openMenu state**

Remove:
```tsx
const [confirmingPause, setConfirmingPause] = useState<string | null>(null);
```

Add:
```tsx
const [openMenu, setOpenMenu] = useState<string | null>(null);
const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
const menuRef = useRef<HTMLDivElement>(null);
```

**Step 2: Add useEffect for outside click and Escape key**

```tsx
useEffect(() => {
  if (!openMenu) return;
  const handleClick = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpenMenu(null);
      setConfirmingAction(null);
    }
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpenMenu(null);
      setConfirmingAction(null);
    }
  };
  document.addEventListener('mousedown', handleClick);
  document.addEventListener('keydown', handleKey);
  return () => {
    document.removeEventListener('mousedown', handleClick);
    document.removeEventListener('keydown', handleKey);
  };
}, [openMenu]);
```

**Step 3: Replace inline buttons with `⋮` button + dropdown in renderSession**

Replace the entire `<div className="flex items-center gap-1 shrink-0">` block (lines 279-328) with:

```tsx
<div className="relative shrink-0" ref={openMenu === s.name ? menuRef : undefined}>
  <button
    onClick={(e) => {
      e.stopPropagation();
      setOpenMenu(openMenu === s.name ? null : s.name);
      setConfirmingAction(null);
    }}
    className="w-8 h-8 flex items-center justify-center text-muted hover:text-primary rounded transition-colors hover:bg-surface"
    title="Actions"
  >
    ⋮
  </button>

  {openMenu === s.name && (
    <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm">
      {/* Pause / Resume */}
      {s.paused ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePauseResume(s.name, 'resume');
            setOpenMenu(null);
          }}
          className="w-full text-left px-3 py-2.5 text-blue-400 hover:bg-surface-hover transition-colors"
        >
          Resume
        </button>
      ) : confirmingAction === s.name ? (
        <div className="px-3 py-2.5">
          <div className="text-yellow-400 text-xs mb-1">Session is busy!</div>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePauseResume(s.name, 'pause');
                setOpenMenu(null);
                setConfirmingAction(null);
              }}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              Pause anyway
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingAction(null);
              }}
              className="text-muted hover:text-primary text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (s.claudeHint === 'busy') {
              setConfirmingAction(s.name);
            } else {
              handlePauseResume(s.name, 'pause');
              setOpenMenu(null);
            }
          }}
          className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
        >
          Pause
        </button>
      )}

      {/* Detach — only if session is open in a tab */}
      {isOpen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDetach(s.name);
            setOpenMenu(null);
          }}
          className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
        >
          Detach
        </button>
      )}

      {/* Rename */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenu(null);
          setEditingSession(s.name);
          setEditValue(s.name);
          setTimeout(() => editInputRef.current?.select(), 0);
        }}
        className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
      >
        Rename
      </button>

      {/* Kill — destructive */}
      {onKill && (
        <>
          <div className="border-t border-border my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onKill(s.name);
              setOpenMenu(null);
            }}
            className="w-full text-left px-3 py-2.5 text-red-400 hover:bg-surface-hover transition-colors"
          >
            Kill
          </button>
        </>
      )}
    </div>
  )}
</div>
```

**Step 4: Remove old onPauseClick function**

Delete the `onPauseClick` function (lines 209-216) since pause logic is now inline in the menu.

**Step 5: Remove double-click rename from session name**

Replace `onDoubleClick` handler on the session name span with nothing — rename is now in the menu. Remove the `title="Double-click to rename"` attribute.

**Step 6: Commit**

```bash
git add src/components/SessionList.tsx
git commit -m "feat: replace inline buttons with dropdown menu"
```

---

### Task 3: Build, test, verify

**Step 1: Build the project**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

**Step 2: Restart the server**

Kill existing server, let launchd restart, verify 200 response.

**Step 3: Manual verification**

- Open wormhole on mobile (or resize to 375px)
- Verify `⋮` button is visible on each session row
- Tap `⋮` → menu opens with correct options
- Tap outside → menu closes
- Test Pause on idle session → works
- Test Pause on busy session → shows confirmation inside menu
- Test Resume on paused session → works
- Test Rename → activates inline input
- Test Kill → session removed
- Test Detach → only shows on attached sessions
- Verify desktop sidebar still works identically

**Step 4: Commit any fixes, then final commit**

```bash
git add src/components/SessionList.tsx src/app/page.tsx
git commit -m "fix: dropdown menu polish"
```

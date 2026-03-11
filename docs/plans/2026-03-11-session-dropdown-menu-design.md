# Session Row Dropdown Menu

## Problem
Inline buttons (pause/resume/detach) cramp session rows on mobile (256px drawer).
Touch targets are too small (~28x20px vs 44px recommended). Pause confirmation
pushes layout. Double-click rename doesn't work on mobile.

## Solution
Replace inline buttons with a single `⋮` button that opens a dropdown menu.

## Menu Items by State

| Session State | Menu Options |
|---|---|
| Running (idle/busy) | Pause, Detach*, Rename, Kill |
| Paused | Resume, Detach*, Rename, Kill |

*Detach only when session is in openTabs.

## Busy Session Warning
Pausing a busy session shows confirmation inside the menu, not inline in the row.

## Touch Targets
- `⋮` button: min 40x40px tap area
- Menu items: full-width rows, min 44px height

## Menu Behavior
- Opens on click/tap of `⋮`
- Closes on: click outside, selecting an action, Escape key
- Positioned below button, aligned right
- Kill styled red (destructive action)
- Rename activates existing inline edit input

## No New Dependencies
Pure CSS/React positioned div with backdrop click-to-close.

## Files Changed
- `src/components/SessionList.tsx` — replace inline buttons with dropdown menu

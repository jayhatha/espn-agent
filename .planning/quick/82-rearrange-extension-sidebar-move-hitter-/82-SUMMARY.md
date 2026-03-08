---
phase: quick-82
plan: "01"
subsystem: extension
tags: [ui, layout, sidebar, toggle]
dependency_graph:
  requires: []
  provides: [rearranged-sidebar-controls]
  affects: [DraftSidebar, DraftNarrator]
tech_stack:
  added: []
  patterns: [toggle-switch, role-switch-aria]
key_files:
  created: []
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/DraftNarrator.tsx
decisions:
  - "Hitter-pitcher split slider placed inside Auto-Pilot wrapper div (not as separate section) so it stays under the same auction-only guard and shares the same container"
  - "Toggle switch for AI Narrator uses identical markup to Auto-Pilot toggle for visual consistency"
metrics:
  duration: "2 minutes"
  completed: "2026-03-08"
---

# Quick Task 82: Rearrange Extension Sidebar — Move Hitter-Pitcher Split, Toggle Narrator Summary

Moved hitter-pitcher split slider from Draft Status into Auto-Pilot section and replaced AI Narrator On/Off text button with a pill toggle switch matching Auto-Pilot style.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move hitter-pitcher split below Auto-Pilot toggle | 0679b94 | DraftSidebar.tsx |
| 2 | Replace AI Narrator On/Off button with toggle switch | 0679b94 | DraftNarrator.tsx |

## What Was Done

### Task 1: Hitter-Pitcher Split Relocation

Removed the split slider block from inside the `{/* Draft Status */}` section (formerly lines 256-275). Inserted the identical markup at the bottom of the Auto-Pilot wrapper div, after the autoMode status message, separated by a `mt-2 pt-2 border-t border-surface-tertiary` divider.

The slider still sits inside the `{draftFormat === "auction" && (...)}` guard and all state wiring (`pitcherHitterSplit`, `setPitcherHitterSplit`) is preserved.

Draft Status section now contains only: pick number, remaining budget, and roster count.

### Task 2: AI Narrator Toggle Switch

Replaced the text-based `<button>Off/On</button>` with the same pill toggle pattern used for Auto-Pilot:
- `role="switch"` with `aria-checked={enabled}` for accessibility
- Same `h-5 w-9` pill shape with `translate-x` thumb animation
- `bg-accent` when enabled, `bg-surface-tertiary` when disabled
- All existing `localStorage` persistence via `NARRATOR_ENABLED_KEY` unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `packages/extension/components/DraftSidebar.tsx` modified — Hit/Pitch Split appears at line 394 inside Auto-Pilot section, not in Draft Status
- [x] `packages/extension/components/DraftNarrator.tsx` modified — `role="switch"` present at line 65, no "Off"/"On" text button remains
- [x] Commit 0679b94 exists in git log
- [x] `pnpm --filter extension build` succeeded with no TypeScript errors

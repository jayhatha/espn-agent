---
phase: quick-80
plan: "01"
subsystem: extension
tags: [autopilot, nomination, dom-selectors, espn]
dependency_graph:
  requires: []
  provides: [working-nomination-turn-detection, working-nominate-button-click]
  affects: [packages/extension/lib/auto-bid-controller.ts]
tech_stack:
  added: []
  patterns: [ESPN DOM selector strategy layering]
key_files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - Added button.bid-player__button as highest-priority selector in clickNominateButton() since it directly matches ESPN's actual confirm button class
  - Added Button--select strategy before generic button[data-player-id] in isMyTurnToNominate() to distinguish nomination turn from queue availability
metrics:
  duration: 5min
  completed: "2026-03-08"
---

# Quick Task 80: Fix Autopilot Nomination Select and Nominate — Summary

Two targeted selector fixes so autopilot nomination correctly detects when it's our turn and successfully clicks the confirmation button.

## What Was Done

### Task 1: Add bid-player__button as high-priority selector and fix isMyTurnToNominate Button--select detection

Two edits to `packages/extension/lib/auto-bid-controller.ts`:

**Edit 1 — `clickNominateButton()` specificSelectors:**

Added `"button.bid-player__button"` as the first entry in the `specificSelectors` array. ESPN's actual DOM uses this class on the "nominate player" confirmation button: `<button class="Button Button--default bid-player__button" ...>nominate player</button>`. Previously the selector `"button.nominate-button"` was first but it does not match any ESPN element, so the code always fell through to the action area selectors and text scan — which also frequently missed the button.

Also updated the fallback text scan `actionWords` from `["nominate", "select player", "submit"]` to `["nominate player", "nominate", "submit"]` so the broad text scan now explicitly matches the button's actual inner text.

**Edit 2 — `isMyTurnToNominate()` Strategy 4:**

Added a new Strategy 4 block checking for `button.Button--select[data-player-id]:not([disabled])` before the existing generic `button[data-player-id]` check (now renumbered Strategy 5). ESPN changes "Queue" buttons to "Select" (class `Button--select`) when it is the current team's turn to nominate. The previous Strategy 4 matched any `button[data-player-id]`, which could be present during an active auction (disabled) or at other times, making it unreliable for turn detection.

**Commit:** `41690bf`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `button.bid-player__button` present in specificSelectors as first entry: confirmed
- `button.Button--select[data-player-id]:not([disabled])` present in isMyTurnToNominate() Strategy 4: confirmed
- `"nominate player"` in fallback actionWords: confirmed
- TypeScript compiler produced no new errors attributable to this change: confirmed

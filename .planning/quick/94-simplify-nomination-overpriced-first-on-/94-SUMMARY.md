---
phase: 94-simplify-nomination-overpriced-first
plan: 01
subsystem: extension-autopilot
tags: [nomination, auto-bid, simplification, extension]
dependency_graph:
  requires: []
  provides: [overpriced-first-nomination]
  affects: [auto-bid-controller, content-script, nomination-diagnostics-ui]
tech_stack:
  added: []
  patterns: [overpriced-first nomination scoring]
key_files:
  modified:
    - packages/extension/lib/auto-bid-controller.ts
    - packages/extension/entrypoints/content.tsx
    - packages/extension/components/NominationDiagnostics.tsx
decisions:
  - Nomination score = espnPrice - modelValue; highest score nominates first
  - modelValue falls back to av.dollarValue when no ranking vbdScore exists
  - Direct playerId button lookup tried before name normalization fallback
  - Queue scraping interval kept (still reads queue state for display); only population removed
metrics:
  duration: ~15 minutes
  completed: 2026-03-16
  tasks: 2
  files: 3
---

# Quick Task 94: Simplify Nomination — Overpriced-First

**One-liner:** Replaced multi-source queue-first nomination with single overpriced-first strategy (nomination_score = espnPrice - modelValue) and removed all queue population code (~530 lines deleted).

## What Was Done

### Task 1: Overpriced-first candidate selection + remove populateQueue call

In `auto-bid-controller.ts`:
- Removed `scrapeESPNNominationQueue` import (no longer used in controller)
- Updated `NominationDiagnostics` interface: removed `queuePopulationCount`, `lastQueuePopulateTime`, `queueStrategy` fields; changed `lastCandidateSource` type from `"simulation" | "idealRoster" | "queue" | null` to `"overpriced" | null`
- Updated docstring: nomination strategy section now says overpriced-first
- Removed queue population instance fields (`lastQueuePopulateTime`, `queuedPlayerIds`, `queueStrategy`)
- Removed static constants `TARGET_QUEUE_SIZE`, `QUEUE_POPULATE_COOLDOWN_MS`, `TARGET_ROSTER_SIZE`
- Removed `this.populateQueue()` call in `updateSignals()`
- Removed queue lines from `clearNominationState()`
- Removed queue fields from `getNominationDiagnostics()` return
- Replaced entire "Queue-first candidate selection" block in `evaluateAndNominate()` with overpriced-first logic: filters `state.auctionValues`, maps to `nominationScore = espnPrice - modelValue`, sorts descending, picks top candidate
- Added direct `findActionButton(topCandidate.playerId)` check before name-based fallback

### Task 2: Remove dead queue code

In `auto-bid-controller.ts`:
- Deleted entire `populateQueue()` async method (~200 lines)
- Deleted `searchAndQueue()` private method (~180 lines)

In `content.tsx`:
- Removed `populateQueue` from dev tools object
- Removed `queuePopulateInterval` variable declaration
- Deleted `startQueuePopulating()` function
- Removed both calls to `startQueuePopulating()` (auction format detection + delayed format re-check)
- Removed `clearInterval(queuePopulateInterval)` from beforeunload cleanup

In `NominationDiagnostics.tsx`:
- Removed "Queue population" diagnostic row
- Simplified candidate source display (removed queue-specific styling)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: No new errors introduced (pre-existing errors in unrelated files unchanged)
- `populateQueue`, `queuedPlayerIds`, `queueStrategy`, `lastQueuePopulateTime`, `TARGET_QUEUE_SIZE`, `QUEUE_POPULATE_COOLDOWN_MS`, `searchAndQueue`, `queuePopulateInterval`, `startQueuePopulating`, `queuePopulationCount` — zero matches in all three modified files
- `nominationScore` present in `evaluateAndNominate()` candidate selection
- `lastCandidateSource` type is `"overpriced" | null`

## Self-Check: PASSED

- `/Users/jay-work/Code/espn-agent/packages/extension/lib/auto-bid-controller.ts` — exists and modified
- `/Users/jay-work/Code/espn-agent/packages/extension/entrypoints/content.tsx` — exists and modified
- `/Users/jay-work/Code/espn-agent/packages/extension/components/NominationDiagnostics.tsx` — exists and modified
- Commit `0caeedd` verified in git log

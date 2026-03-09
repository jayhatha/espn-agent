---
phase: 35-use-the-queue-for-player-nominations-instead-of-finding-players-on-the-fly
plan: 01
subsystem: ui
tags: [chrome-extension, zustand, dom-scraping, typescript, espn-auction]

# Dependency graph
requires: []
provides:
  - ESPNQueueEntry interface exported from dom-observers.ts
  - scrapeESPNNominationQueue() function that reads ESPN Dequeue buttons from DOM
  - espnNominationQueue store field (session-only, not persisted) in Zustand store
  - setEspnNominationQueue action in Zustand store
affects:
  - phase 35 plan 02 (wires queue scraper into content.tsx and auto-bid-controller.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dequeue button text heuristic: match button[data-player-id] text against [dequeue, deselect, remove] variants to detect queued players"
    - "Session-only Zustand field: add to initial state and reset/initializeDraft but exclude from partialize()"

key-files:
  created: []
  modified:
    - packages/extension/lib/dom-observers.ts
    - packages/extension/lib/draft-state.ts

key-decisions:
  - "Use Dequeue button text heuristic (checking button[data-player-id] text for dequeue/deselect/remove) rather than relying on a dedicated queue panel container — the container class is unverified against live ESPN DOM but button text detection is resilient to DOM changes"
  - "espnNominationQueue is session-only (NOT in partialize) because the queue is transient draft state that loses all value across page reloads"
  - "Inline the queue entry type in draft-state.ts rather than importing from dom-observers.ts to avoid creating circular dependency between the two modules"
  - "queuePosition is 0-based counter matching DOM order — Phase 35 plan 02 will use index 0 as the first nomination candidate"

patterns-established:
  - "Pattern: Session-only Zustand fields are added to initial state, reset(), and initializeDraft() different-draft branch, but deliberately omitted from partialize()"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 35 Plan 01: ESPN Nomination Queue — Data Layer Summary

**ESPN nomination queue scraper using Dequeue button text heuristic plus session-only Zustand store field exposing ordered list of queued players**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `ESPNQueueEntry` interface and `scrapeESPNNominationQueue()` to dom-observers.ts — detects queued players by finding `button[data-player-id]` elements whose text matches dequeue/deselect/remove variants
- Added `espnNominationQueue` field and `setEspnNominationQueue` action to Zustand store — session-only state excluded from partialize, cleared on reset and initializeDraft
- No circular dependency introduced: queue entry type is defined inline in draft-state.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scrapeESPNNominationQueue() to dom-observers.ts** - `a98d3fe` (feat)
2. **Task 2: Add espnNominationQueue store field and setter to draft-state.ts** - `481ee22` (feat)

## Files Created/Modified
- `packages/extension/lib/dom-observers.ts` - Added ESPNQueueEntry interface and scrapeESPNNominationQueue() function after scrapeESPNAuctionTable(), before observeCurrentAuctionPlayer()
- `packages/extension/lib/draft-state.ts` - Added espnNominationQueue field to DraftState interface, initial state, reset(), initializeDraft() different-draft branch, and setEspnNominationQueue action; field excluded from partialize()

## Decisions Made
- Dequeue button text heuristic chosen over ESPN queue panel container detection because the panel container class is unverified — button text is more resilient
- Inline type definition in draft-state.ts rather than import from dom-observers.ts to prevent circular dependencies
- `espnNominationQueue` excluded from partialize() — queue is transient session state that changes between drafts and offers no value when persisted

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in the extension package (unrelated files: PlayerCard.tsx, content.tsx, auto-bid-controller.ts, api-client.ts, various test files) — all pre-existing before these changes, confirmed by error messages pointing to unrelated code paths. No new errors were introduced by this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer is complete: `scrapeESPNNominationQueue()` and `espnNominationQueue` store field are ready
- Plan 02 can now wire the scraper into content.tsx (interval polling) and update `evaluateAndNominate()` in auto-bid-controller.ts to prefer queue over on-the-fly candidate selection

---
*Phase: 35-use-the-queue-for-player-nominations-instead-of-finding-players-on-the-fly*
*Completed: 2026-03-09*

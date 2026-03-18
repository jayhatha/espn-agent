---
phase: 95-wire-shouldbid-from-monte-carlo-into-aut
plan: 01
subsystem: extension
tags: [monte-carlo, auto-bid, shouldBid, auction-draft]

requires:
  - phase: 54-auction-engine-test-suite
    provides: Monte Carlo simulation with shouldBid signal
provides:
  - shouldBid gate in auto-bid controller evaluateAndBid
affects: [auto-bid, auction-draft, extension-sidebar]

tech-stack:
  added: []
  patterns: [strict-equality-gate-for-nullable-boolean]

key-files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts

key-decisions:
  - "shouldBid uses === false strict check so null/undefined fall through to normal bidding"

patterns-established:
  - "Simulation signal gating: check explicit false before price cap, allowing async worker results to override"

requirements-completed: [SHOULDBID-GATE]

duration: 3min
completed: 2026-03-18
---

# Quick Task 95: Wire shouldBid from Monte Carlo into Auto-Bid Controller Summary

**Monte Carlo shouldBid=false gate added to evaluateAndBid, passing on players where simulation EV favors not bidding**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T18:23:51Z
- **Completed:** 2026-03-18T18:27:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added shouldBid gate after strategy cap computation and before price-vs-cap check
- Logs simulation EV and stdDev when shouldBid=false for debugging
- Uses strict `=== false` so null/undefined fall through to normal cap-based bidding

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shouldBid gate to evaluateAndBid** - `b22abaa` (feat)

## Files Created/Modified
- `packages/extension/lib/auto-bid-controller.ts` - Added shouldBid === false gate in evaluateAndBid between GS cap awareness and price-vs-cap check

## Decisions Made
- Used strict equality (`=== false`) rather than falsy check so null/undefined (worker hasn't returned yet) falls through to normal bidding behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- shouldBid signal now respected by auto-bid controller
- Future work could add shouldBid visualization in sidebar UI

---
*Quick Task: 95-wire-shouldbid-from-monte-carlo-into-aut*
*Completed: 2026-03-18*

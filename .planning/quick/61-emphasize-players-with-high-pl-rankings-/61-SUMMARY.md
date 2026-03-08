---
phase: 61-emphasize-pl-undervalued-sp-auto-bid
plan: 01
subsystem: extension
tags: [auto-bid, auction, pitcherlist, rankings, chrome-extension]

# Dependency graph
requires:
  - phase: 20-deterministic-draft-engine
    provides: auto-bid controller, engine signals, rankings data
provides:
  - Three-path auto-bid strategy with PL undervalued detection
  - SP-aware opportunity thresholds (top-100 vs top-50)
affects: [auto-bid-controller, draft-sidebar, auction-strategy]

# Tech tracking
tech-stack:
  added: []
  patterns: [position-aware bid thresholds, multi-path bid strategy with priority ordering]

key-files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts

key-decisions:
  - "PL UNDERVALUED cap at ASV+15% — between ideal (+10%) and opportunity (at-market) — trusts PL assessment without overpaying"
  - "SP thresholds more generous (rank<=100 & ASV<$10, rank<=50 & ASV<$15) because PL SP rankings are deepest and most reliable"
  - "Priority ordering IDEAL > PL UNDERVALUED > OPPORTUNITY — a player matching multiple paths gets the highest-priority cap"

patterns-established:
  - "Position-aware thresholds: SP gets wider thresholds for external rank checks"
  - "Three-path bid strategy: ideal target, PL undervalued, opportunity — each with distinct cap logic"

requirements-completed: [ENHANCEMENT]

# Metrics
duration: 2min
completed: 2026-03-07
---

# Quick 61: PL Undervalued Auto-Bid Path Summary

**Three-path auto-bid strategy with PL undervalued detection for mispriced high-ranked players, plus SP-widened opportunity threshold (top-100)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T02:02:20Z
- **Completed:** 2026-03-08T02:04:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added PL UNDERVALUED bid path targeting high PL rank + low ESPN ASV players (market mispricing)
- SP-specific thresholds: rank<=50 & ASV<$15, rank<=100 & ASV<$10; General: rank<=30 & ASV<$20, rank<=75 & ASV<$12
- PL UNDERVALUED bid cap at ASV + 15% (between ideal +10% and opportunity at-market)
- Widened SP opportunity threshold from top-50 to top-100 external rank
- Console logs clearly label which bid path triggered (IDEAL TARGET, PL UNDERVALUED, OPPORTUNITY)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PL UNDERVALUED bid path and widen SP opportunity threshold** - `ff4c3b1` (feat)

## Files Created/Modified
- `packages/extension/lib/auto-bid-controller.ts` - Added third bid path (PL UNDERVALUED), SP-aware opportunity thresholds, updated class JSDoc and strategy comments

## Decisions Made
- PL UNDERVALUED cap at ASV + 15% — trusts PL ranking assessment without excessive overpay
- SP thresholds are more generous because PitcherList SP rankings have the deepest coverage
- Priority ordering: IDEAL > PL UNDERVALUED > OPPORTUNITY ensures a player matching multiple paths gets the best cap

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Three-path auto-bid strategy is active and ready for auction use
- Future enhancement: could add RP-specific thresholds if PitcherList RP rankings prove reliable

## Self-Check: PASSED

- FOUND: packages/extension/lib/auto-bid-controller.ts
- FOUND: commit ff4c3b1
- FOUND: 61-SUMMARY.md

---
*Phase: 61-emphasize-pl-undervalued-sp-auto-bid*
*Completed: 2026-03-07*

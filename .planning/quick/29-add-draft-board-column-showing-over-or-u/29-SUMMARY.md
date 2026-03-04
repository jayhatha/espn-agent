---
phase: quick-29
plan: 01
subsystem: ui
tags: [draft-board, rankings, sorting, color-coding, react]

# Dependency graph
requires: []
provides:
  - Rank +/- column in draft board showing ESPN rank vs PitcherList external rank gap
  - Color-coded rank difference display (green = undervalued bargain, red = overvalued)
  - Sort by Rank +/- option sorting by largest absolute gap first
affects: [draft-board]

# Tech tracking
tech-stack:
  added: []
  patterns: [rankDiff computed as ESPN rank minus external rank, positive = ESPN ranks player lower = bargain]

key-files:
  created: []
  modified:
    - packages/frontend/src/app/admin/draft-board/page.tsx

key-decisions:
  - "rankDiff = p.rank - match.rank (positive = ESPN ranks player lower = undervalued bargain)"
  - "Sort by absolute value descending so biggest gaps in either direction surface first"
  - "Color thresholds at 20 for semibold emphasis (strong signal) vs >0 for mild signal"

patterns-established: []

requirements-completed: [QUICK-29]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Quick Task 29: Draft Board Rank +/- Column Summary

**Always-visible Rank +/- column in draft board showing ESPN vs PitcherList rank gap with green/red color coding and sort support**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-04T06:55:35Z
- **Completed:** 2026-03-04T06:57:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `rankDiff` field to `MergedPlayer` interface computed as ESPN rank minus external rank
- Positive values (undervalued by ESPN) render green; negative (overvalued) render red
- Strong signal (>= 20 / <= -20) renders with `font-semibold` for emphasis
- Sort dropdown includes "Rank +/- (ext vs ESPN)" option sorting by largest absolute gap first
- Players without external ranking show em dash; column always visible regardless of CSV uploads

## Task Commits

1. **Task 1: Add rankDiff field, computation, sort, column header, cell, and sort option** - `1a9808d` (feat)

## Files Created/Modified

- `packages/frontend/src/app/admin/draft-board/page.tsx` - Added rankDiff to MergedPlayer interface, computation in matchPlayers, sort case, table header, color-coded table cell, and sort dropdown option

## Decisions Made

- `rankDiff = p.rank - match.rank` where positive means ESPN ranks the player lower (higher rank number) than PitcherList, meaning ESPN undervalues them — this is the "bargain" direction
- Sort by `Math.abs(rankDiff)` descending so the biggest discrepancies (both directions) surface first, matching the pattern already used by `valueDiff` sort
- Color thresholds set at 20 for strong signal (semibold) and any non-zero for mild signal, matching typical rank gap significance in fantasy baseball

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Draft board now shows rank discrepancies alongside auction value discrepancies
- Column is always visible so users can identify bargains even without CSV uploads
- Color coding mirrors the existing valueDiff pattern for visual consistency

---
*Phase: quick-29*
*Completed: 2026-03-04*

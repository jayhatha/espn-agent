---
phase: 48-nomination-strategy-rework
plan: "01"
subsystem: engine
tags: [nomination, auction, overpricing, chrome-extension]

requires:
  - phase: espnDomAuctionValues
    provides: ESPN average salary scraped from draft DOM
provides:
  - Overpricing-based nomination scoring (espn_avg_salary - model_dollar_value)
  - espnAvgSalary field on PoolPlayer type
affects: [nomination-strategy, forward-simulation, auto-bid-controller]

tech-stack:
  added: []
  patterns: [overpricing-based nomination scoring with fallback to budget drain]

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/nomination-strategy.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/__tests__/nomination-strategy.test.ts

key-decisions:
  - "Overpricing = espnAvgSalary - modelDollars, normalized to 0-1 with MAX_OVERPRICING=30"
  - "60/20/20 weight split: overpricing primary, opponent need secondary, my non-need tertiary"
  - "Fallback to budget drain heuristic (dollars/50) when ESPN ASV unavailable"

patterns-established:
  - "Stamp espnAvgSalary onto PoolPlayer in computeDraftEngine before passing to worker"

requirements-completed: [NOM-07, NOM-08]

duration: 4min
completed: 2026-03-15
---

# Phase 48 Plan 01: Nomination Strategy Rework Summary

**Overpricing-based nomination scoring replacing trap scoring: nominationScore = (espnAvgSalary - modelDollars) * 0.6 + opponentNeed * 0.2 + myNonNeed * 0.2**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T23:30:14Z
- **Completed:** 2026-03-15T23:34:21Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- Added espnAvgSalary field to PoolPlayer type for ESPN market price tracking
- Stamped ESPN DOM auction values onto PoolPlayers in computeDraftEngine
- Rewrote nomination strategy from 3-factor trap scoring to overpricing-based scoring
- Updated 9 tests covering overpricing, fallback, reason strings, and factor weighting

## Task Commits

Each task was committed atomically:

1. **Task 1: Add espnAvgSalary to PoolPlayer** - `6e1cb36` (feat)
2. **Task 2: Stamp espnAvgSalary in engine** - `2c8cfdc` (feat)
3. **Task 3: Rewrite nomination strategy** - `a2449c6` (feat)
4. **Task 4: Update tests** - `6e58948` (test)
5. **Task 5: Build verification** - no commit (verification only)

## Files Created/Modified
- `packages/extension/lib/engine/types.ts` - Added espnAvgSalary optional field to PoolPlayer
- `packages/extension/lib/engine/index.ts` - Stamp espnAvgSalary from espnDomAuctionValues onto undraftedPlayers
- `packages/extension/lib/engine/nomination-strategy.ts` - Overpricing-based scoring with fallback
- `packages/extension/lib/__tests__/nomination-strategy.test.ts` - 9 tests for new scoring logic

## Decisions Made
- Used MAX_OVERPRICING=30 for normalization (reasonable max delta between ESPN avg salary and model value)
- 60/20/20 weight split prioritizes overpricing while keeping opponent need and my non-need as useful tiebreakers
- Fallback to budget drain heuristic when no ESPN ASV available (graceful degradation)
- Reason strings differentiate "Overpriced by $X" (>5) vs "Slightly overpriced" (0-5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Nomination strategy now prioritizes overpriced players to force league overspending
- ESPN ASV data flows from DOM scrape through to nomination scoring
- Ready for integration testing during live draft sessions

---
*Phase: 48-nomination-strategy-rework*
*Completed: 2026-03-15*

## Self-Check: PASSED

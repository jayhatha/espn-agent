---
phase: 23-roster-optimization-engine
plan: 02
subsystem: extension
tags: [bid-optimizer, opponent-model, monte-carlo, draft-engine, fantasy-baseball, typescript, vitest]

# Dependency graph
requires:
  - phase: 23-roster-optimization-engine-plan-01
    provides: "optimizeRoster, buildSGPVectors, PoolPlayer, SGPVectors, RosterOptimizationResult from Plan 01"
provides:
  - "Bid optimizer: computeMaxBid via binary search over optimizeRoster (O(log budget) iterations)"
  - "Opponent model: buildOpponentModel (per-team position needs, competition factors), estimateMarketPrice, computePositionCompetition"
  - "Monte Carlo engine: runMonteCarlo with bid/pass scenario comparison, index-set simulation (no mutation)"
  - "New types: BidOptimizerResult, OpponentModel, TargetRecommendation, MonteCarloResult in types.ts"
affects:
  - "23-03-PLAN.md (Plan 03 wires these modules into DraftEngineSignals / use-draft-engine hook)"
  - "Extension sidebar: bid optimizer and Monte Carlo enable actionable draft recommendations"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Binary search over optimizeRoster: lo=1, hi=min(budget-slots, dollars*3), converges O(log budget)"
    - "Baseline comparison: optimizeRoster without nominated player vs with player at candidate price"
    - "Competition factors: teamsNeedingPosition / totalTeams (0-1 scale)"
    - "Market price estimation: basePrice * (1 + competitionFactor * 0.2) rounded to integer"
    - "Index-set simulation in Monte Carlo: Set<number> instead of array splice/filter — O(1) remove"
    - "Weighted shuffle: SGP * (0.8 + random * 0.4) jitter for per-sim opponent variation"

key-files:
  created:
    - packages/extension/lib/engine/opponent-model.ts
    - packages/extension/lib/engine/bid-optimizer.ts
    - packages/extension/lib/engine/monte-carlo.ts
    - packages/extension/lib/__tests__/opponent-model.test.ts
    - packages/extension/lib/__tests__/bid-optimizer.test.ts
    - packages/extension/lib/__tests__/monte-carlo.test.ts
  modified:
    - packages/extension/lib/engine/types.ts

key-decisions:
  - "Binary search hi bound = min(budget-minSlots, dollars*3) — caps search range without hardcoding auction maximums"
  - "Locked player SGP tracked explicitly in computeMaxBid by looking up nominatedIndex in sgpValues — consistent with Plan 01 locked player contract"
  - "Monte Carlo uses Set<number> index tracking to avoid O(n) array splice cost — critical for 200-sim * 50-player performance"
  - "Opponent simulation in Monte Carlo uses simplified position matching (not full SLOT_PRIORITY) for speed — acceptable accuracy tradeoff"
  - "bidEV and passEV both equal expectedTeamValue (no difference) when no nominated player provided"
  - "Test fixture for replacement-level player: requires pool size > roster slots AND budget covers best alternatives — degenerate cases with unfillable slots produce non-zero bids"

patterns-established:
  - "Bid optimizer pattern: baseline = optimizeRoster(without player), binary search = optimizeRoster(with player locked at mid), compare totalSGP"
  - "Monte Carlo pattern: for each sim, build fresh available Set, run bid and pass scenarios, collect EV arrays, compute mean/stddev at end"

requirements-completed: []

# Metrics
duration: 23min
completed: 2026-03-05
---

# Phase 23 Plan 02: Bid Optimizer, Opponent Model, and Monte Carlo Summary

**Binary-search max bid computation, per-team opponent need modeling with competition factors, and index-set Monte Carlo draft simulation for bid/pass EV comparison**

## Performance

- **Duration:** 23 min
- **Started:** 2026-03-05T17:45:19Z
- **Completed:** 2026-03-05T18:08:29Z
- **Tasks:** 3 (1a opponent model, 1b bid optimizer, 2 Monte Carlo)
- **Files modified:** 7

## Accomplishments
- Created `opponent-model.ts` with `buildOpponentModel` (per-team position needs, competition factors from teamRosters + allPicks), `estimateMarketPrice` (base price * competition adjustment), and `computePositionCompetition` (max factor across eligible positions)
- Created `bid-optimizer.ts` with `computeMaxBid` binary search over `optimizeRoster`: lo=1, hi=min(budget-minSlots, dollars*3), converges O(log budget), returns maxBid, valueSurplus, baselineValue, withPlayerValue, expectedMarketPrice
- Created `monte-carlo.ts` with `runMonteCarlo` running N simulations (default 200) with bid/pass scenario comparison, index-Set-based simulation (no array mutation), weighted jitter shuffle for opponent variation
- Added `BidOptimizerResult`, `OpponentModel`, `TargetRecommendation`, `MonteCarloResult` types to `types.ts`
- 25 new tests (12 opponent model + 5 bid optimizer + 8 Monte Carlo); all 87 extension tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1a: Opponent model with competition factors and market price estimation** - `e4c8ffe` (feat)
2. **Task 1b: Bid optimizer with binary-search max bid computation** - `041a6d6` (feat)
3. **Task 2: Monte Carlo draft simulation engine with bid/pass EV comparison** - `2d09978` (feat)

**Plan metadata:** pending (docs commit)

_Note: TDD tasks: RED (failing test created) → GREEN (implementation) → all tests passing_

## Files Created/Modified
- `packages/extension/lib/engine/opponent-model.ts` - buildOpponentModel, estimateMarketPrice, computePositionCompetition
- `packages/extension/lib/engine/bid-optimizer.ts` - computeMaxBid binary search over optimizeRoster
- `packages/extension/lib/engine/monte-carlo.ts` - runMonteCarlo with 200-sim bid/pass EV computation
- `packages/extension/lib/__tests__/opponent-model.test.ts` - 12 tests for competition factors, market price, position competition
- `packages/extension/lib/__tests__/bid-optimizer.test.ts` - 5 tests for binary search, replacement-level, not-in-pool, valueSurplus, convergence
- `packages/extension/lib/__tests__/monte-carlo.test.ts` - 8 tests for basic sim, bid>pass, pass>bid, reproducibility, edge cases, mutation, performance
- `packages/extension/lib/engine/types.ts` - Added BidOptimizerResult, OpponentModel, TargetRecommendation, MonteCarloResult

## Decisions Made
- Binary search hi bound = `min(budget-minSlots, ceil(dollars*3))` — caps search range proportionally to player's listed dollar value, no hardcoded maximums
- Locked player SGP tracked explicitly by looking up `nominatedIndex` in `sgpValues` — consistent with Plan 01 locked player contract (SGP is caller's responsibility)
- Monte Carlo uses `Set<number>` for available player tracking — `remaining.delete(idx)` is O(1) vs O(n) array splice; critical for 200-sim performance
- Opponent simulation in Monte Carlo uses simplified position matching (not full SLOT_PRIORITY from roster-optimizer) — acceptable accuracy tradeoff vs speed in per-sim opponent fill
- bidEV and passEV both equal expectedTeamValue when no nominated player provided — consistent API surface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test fixture for replacement-level player edge case**
- **Found during:** Task 1b (bid optimizer test - GREEN phase debug)
- **Issue:** First test fixture had all 5 players costing $40-$20 with budget $100. The "replacement-level" player still showed maxBid=3 because: (a) the player's `hi_initial = min(100-4, ceil(1*3)) = 3`, and (b) with budget constraints, the baseline itself couldn't fill all slots (too expensive), so adding the cheap replacement player at $1-$2 still matched baseline performance (both scenarios fill ~3 slots). Tests returned 3 instead of expected 1.
- **Fix:** Redesigned fixture to use a minimal 2-slot roster (OF:1, SS:1, budget=$30) where the baseline CAN fill both slots from good alternatives ($15+$14=$29), but adding the replacement player locks the OF slot leaving only SS filled (8.1 SGP vs 18 baseline). Now `checkAtPrice(1)` returns false → maxBid=1 correctly.
- **Files modified:** `packages/extension/lib/__tests__/bid-optimizer.test.ts`
- **Verification:** Test passes: `expect(result.maxBid).toBe(1)` ✓
- **Committed in:** 041a6d6 (Task 1b commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Bug fix necessary for test correctness. No scope creep. Root cause was a degenerate fixture where the "good" players were too expensive to fill all slots within budget — the replacement player filled a slot that would otherwise be empty.

## Issues Encountered
- None beyond the auto-fixed test fixture bug above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 can now import `computeMaxBid`, `buildOpponentModel`, `estimateMarketPrice`, `computePositionCompetition`, `runMonteCarlo` from these modules
- All types exported from `types.ts`: `BidOptimizerResult`, `OpponentModel`, `MonteCarloResult`
- All 87 extension tests passing, no type errors in new files
- Pre-existing TypeScript errors in api-client.ts, draft-state.ts, content.tsx (non-plan-02 scope) noted as out-of-scope

---
*Phase: 23-roster-optimization-engine*
*Completed: 2026-03-05*

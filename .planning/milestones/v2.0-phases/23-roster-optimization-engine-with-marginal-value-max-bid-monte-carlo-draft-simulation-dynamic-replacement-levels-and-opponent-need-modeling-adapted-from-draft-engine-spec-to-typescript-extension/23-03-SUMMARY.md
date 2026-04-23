---
phase: 23-roster-optimization-engine
plan: 03
subsystem: extension
tags: [roster-optimizer, sgp, bid-optimizer, monte-carlo, opponent-model, draft-engine, typescript, react]

# Dependency graph
requires:
  - phase: 23-roster-optimization-engine-plan-01
    provides: "buildSGPVectors, optimizeRoster, buildFgPlayerPool, normalizeName from Plan 01"
  - phase: 23-roster-optimization-engine-plan-02
    provides: "computeMaxBid, buildOpponentModel, estimateMarketPrice, computePositionCompetition, runMonteCarlo from Plan 02"
provides:
  - "computeDraftEngine orchestrator extended with step 7: roster optimization producing RosterOptimizationSignal"
  - "Two-level module cache: sgpCacheKey (allPicks.length) + bidCacheKey (playerId + pickCount)"
  - "AuctionBudgetTracker displays SGP max bid with BID/PASS badge, expected market price, value surplus"
  - "EngineInsights Top Targets section with player recommendations and Monte Carlo EV summary"
affects:
  - "Extension sidebar auction draft experience"
  - "use-draft-engine.ts hook consumers receive optimization in DraftEngineSignals"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-level cache: SGP vectors (allPicks.length) + bid optimizer (playerId + pickCount) prevents over-computation"
    - "computeRosterOptimization: top 200 players by dollar value, hardcoded DEFAULT_ROSTER_SLOTS per spec"
    - "Graceful degradation: optimization step wrapped in try/catch, null returned on any failure"
    - "BID/PASS badge: optimization.shouldBid from Monte Carlo bidEV > passEV comparison"

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/components/AuctionBudgetTracker.tsx
    - packages/extension/components/EngineInsights.tsx

key-decisions:
  - "Two-level cache: sgpCacheKey invalidates on allPicks.length change; bidCacheKey invalidates on nomination OR pick count — prevents redundant bid optimizer and Monte Carlo recomputes between renders"
  - "Top 200 players by dollar value cap limits SGP computation cost while preserving most relevant targets"
  - "Hardcoded DEFAULT_ROSTER_SLOTS { C:1, 1B:1, 2B:1, SS:1, 3B:1, CI:1, MI:1, OF:4, UTIL:3, P:9 } per Phase 23 CONTEXT.md locked decision"
  - "optimization: null when leagueCategories is empty OR on any exception — sidebar falls back to heuristic max bid"
  - "BID/PASS badge only shown when optimization signal is present; inflation badge kept alongside it"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 23 Plan 03: Engine Integration and UI Surface Summary

**SGP-based roster optimization wired into computeDraftEngine orchestrator with two-level module cache, BID/PASS badge in AuctionBudgetTracker, and Top Targets section in EngineInsights**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T18:11:19Z
- **Completed:** 2026-03-05T18:14:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `RosterOptimizationSignal` interface to `types.ts` with `maxBid`, `expectedMarketPrice`, `valueSurplus`, `shouldBid`, `topTargets`, `opponentPressure`, `simulationEV`, `simulationStdDev`, `computeTimeMs`
- Added `optimization: RosterOptimizationSignal | null` to `DraftEngineSignals` interface
- Extended `engine/index.ts` with `computeRosterOptimization` function (step 7 in `computeDraftEngine`)
- Wired all Phase 23 modules: `buildSGPVectors`, `computeMaxBid`, `buildOpponentModel`, `estimateMarketPrice`, `computePositionCompetition`, `runMonteCarlo`
- Two-level module cache prevents re-computation on every render triggered by bid changes
- `AuctionBudgetTracker`: SGP-based max bid replaces heuristic, BID/PASS badge, expected market price, value surplus displayed
- `EngineInsights`: collapsed Top Targets section added between Build Analysis and Top Scarcity with player names, SGP badges, expected price, MC simulation EV
- All 87 extension tests passing, no new TypeScript errors in modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire roster optimization into computeDraftEngine and extend DraftEngineSignals** - `3d7c98a` (feat)
2. **Task 2: Surface roster optimization signals in sidebar UI components** - `e77afc6` (feat)

## Files Created/Modified
- `packages/extension/lib/engine/index.ts` - computeRosterOptimization function + step 7 in orchestrator, two-level SGP + bid cache, DEFAULT_ROSTER_SLOTS, imports for all new modules
- `packages/extension/lib/engine/types.ts` - RosterOptimizationSignal interface added, DraftEngineSignals.optimization field added
- `packages/extension/components/AuctionBudgetTracker.tsx` - SGP max bid display with BID/PASS badge, expected market price row, value surplus row; graceful fallback to heuristic when optimization=null
- `packages/extension/components/EngineInsights.tsx` - Top Targets section (collapsed by default, renders when topTargets.length > 0), MC Simulation EV summary below target list

## Decisions Made
- Two-level cache: SGP vectors cached by `allPicks.length`; bid optimizer + Monte Carlo cached by `currentAuctionPlayerId + '_' + allPicks.length` — prevents over-computation on bid price changes that trigger UI re-renders
- Top 200 players by dollar value cap: limits SGP computation time while covering all meaningful draft targets
- Hardcoded `DEFAULT_ROSTER_SLOTS` per Phase 23 CONTEXT.md locked decision (dynamic detection deferred)
- Graceful degradation: `optimization = null` when `leagueCategories.length === 0` or on any exception — sidebar falls back to prior behavior without crashing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 is complete: SGP model (Plan 01) → bid optimizer / Monte Carlo (Plan 02) → engine integration + UI (Plan 03)
- Extension sidebar now shows SGP-based max bid, bid/pass recommendation, and top target recommendations during live auction drafts

---

## Self-Check: PASSED

**Files verified:**
- FOUND: `packages/extension/lib/engine/index.ts`
- FOUND: `packages/extension/lib/engine/types.ts`
- FOUND: `packages/extension/components/AuctionBudgetTracker.tsx`
- FOUND: `packages/extension/components/EngineInsights.tsx`

**Commits verified:**
- FOUND: `3d7c98a` feat(23-03): wire roster optimization into computeDraftEngine...
- FOUND: `e77afc6` feat(23-03): surface roster optimization signals in sidebar UI...

**Tests:** 87 passed (7 test files)
**Type errors in new files:** 0

---
*Phase: 23-roster-optimization-engine*
*Completed: 2026-03-05*

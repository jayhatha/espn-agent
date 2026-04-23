---
phase: 26-per-position-target-engine
plan: 01
subsystem: extension
tags: [typescript, vitest, auction-draft, sgp, shopping-list, position-targeting]

# Dependency graph
requires:
  - phase: 23-roster-optimization-engine
    provides: OpponentModel, PoolPlayer, estimateMarketPrice, computePositionCompetition types and functions
  - phase: 25-projected-standings
    provides: RosterOptimizationSignal interface extended here with shoppingList field

provides:
  - "computeShoppingList pure function in packages/extension/lib/engine/shopping-list.ts"
  - "computePositionPriority helper exported for testability"
  - "PositionTarget, PositionGroup, ShoppingListSignal types in engine/types.ts"
  - "shoppingList: ShoppingListSignal | null field on RosterOptimizationSignal"
  - "18 test cases in shopping-list.test.ts"

affects:
  - phase-27-shopping-list-ui
  - engine/index.ts (RosterOptimizationSignal consumers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parallel-array pattern: sgpValues[i] aligned to allPlayers[i] by index convention"
    - "position-group building: iterate positions in needByPosition (O(players * positions))"
    - "quick max bid heuristic: min(budget, expectedPrice, max(1, ceil(dollars * 2))) — avoids binary search"
    - "priority weight formula: scarcity*0.4 + slotWeight*0.35 + budgetFit*0.25"

key-files:
  created:
    - packages/extension/lib/engine/shopping-list.ts
    - packages/extension/lib/__tests__/shopping-list.test.ts
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "computeShoppingList uses quick heuristic (not binary search computeMaxBid) for max bid — per-target pricing at scale must be O(n), not O(n*log) per player"
  - "needByPosition drives position groups — positions with 0 unfilled slots never appear in output, enforcing PRIO-02 at the input boundary"
  - "Multi-position players added to each eligible position group independently — adjustedSgp uses that group's unfilledSlots for positional need boost"
  - "Pitcher consolidation: when needByPosition lacks SP/RP but remainingSlots has P > 0, add P group mapping both SP and RP players"
  - "shoppingList: null placeholder in both computeRosterOptimization return paths — Phase 27 wires the actual computeShoppingList call into the engine"

patterns-established:
  - "Priority score exported as separate pure function (computePositionPriority) to enable direct unit testing of the weight formula"
  - "Performance.now() timing recorded in ShoppingListSignal.computeTimeMs for dashboard visibility"

requirements-completed: [TARG-01, TARG-02, TARG-03, TARG-05, PRIO-01, PRIO-02]

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 26 Plan 01: Per-Position Shopping List Engine Summary

**Per-position target grouping with combined priority scoring (scarcity 40% + slots 35% + budget fit 25%) and quick market price estimation via estimateMarketPrice, with 18 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T07:25:55Z
- **Completed:** 2026-03-06T07:30:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `computeShoppingList()` pure function that groups undrafted players by position, scores them with positional need + weak category boosts, and computes per-target pricing using the existing `estimateMarketPrice()` opponent model function
- Added three new interfaces (`PositionTarget`, `PositionGroup`, `ShoppingListSignal`) and extended `RosterOptimizationSignal` with `shoppingList: ShoppingListSignal | null`
- Exported `computePositionPriority()` as a standalone testable helper implementing the 40/35/25 weight formula
- 18 comprehensive test cases covering all specified requirements (TARG-01, TARG-02, TARG-03, TARG-05, PRIO-01, PRIO-02)

## Task Commits

1. **Task 1: Types and computeShoppingList implementation** - `7cc07e5` (feat)
2. **Task 2: Comprehensive tests** - `e200a93` (test)

## Files Created/Modified

- `packages/extension/lib/engine/shopping-list.ts` - New module with `computeShoppingList` and `computePositionPriority` exports (130 lines)
- `packages/extension/lib/__tests__/shopping-list.test.ts` - 18 test cases covering all plan requirements (240 lines)
- `packages/extension/lib/engine/types.ts` - Added `PositionTarget`, `PositionGroup`, `ShoppingListSignal` interfaces; added `shoppingList` field to `RosterOptimizationSignal`
- `packages/extension/lib/engine/index.ts` - Added `shoppingList: null` to both return paths to satisfy the updated interface (Phase 27 will wire the actual function call)

## Decisions Made

- Quick max bid heuristic (`min(budget, expectedPrice, max(1, ceil(dollars * 2)))`) instead of binary search `computeMaxBid()` — per-target pricing must scale to O(n) across an entire position group; binary search is reserved for the single nominated player
- `needByPosition` drives which positions get groups (positions with 0 unfilled = excluded at input boundary, clean PRIO-02 enforcement)
- Multi-position players appear in each eligible group independently, with that group's unfilledSlots used for positional need boost
- `shoppingList: null` placeholders in `index.ts` — the Phase 27 UI plan will wire the actual `computeShoppingList` call once the sidebar integration is designed

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in the extension (33 errors in api-client.ts, entrypoints, etc.) are unrelated to this plan and were present before execution. Zero new errors introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `computeShoppingList()` and all types ready for Phase 27 (Shopping List UI)
- Phase 27 needs to: (1) call `computeShoppingList()` inside `computeRosterOptimization()` with the already-computed `needByPosition`, `sgpValues`, `opponentModel`, etc., and (2) replace the flat Top Targets section in `EngineInsights` with collapsible position group cards

---
*Phase: 26-per-position-target-engine*
*Completed: 2026-03-06*

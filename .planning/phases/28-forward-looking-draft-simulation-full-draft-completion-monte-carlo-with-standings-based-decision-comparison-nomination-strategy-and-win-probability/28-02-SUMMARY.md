---
phase: 28-forward-looking-draft-simulation
plan: 02
subsystem: extension-engine
tags: [simulation, nomination-strategy, draft-engine, monte-carlo, win-probability]
dependency_graph:
  requires: [28-01]
  provides: [nomination-strategy, simulation-wiring, forward-simulation-signal]
  affects: [packages/extension/lib/engine/index.ts, packages/extension/lib/engine/nomination-strategy.ts]
tech_stack:
  added: []
  patterns:
    - Heuristic trap scoring (budget drain + opponent need + my non-need)
    - Three-factor trapScore (0-1 scale) with floored minimum at 0.01
    - Player pool hoisting for shared computation across simulation steps
    - Simulation cache by allPicks.length + currentAuctionPlayerId
    - Draft progress guard (skip simulation before 10% picks made)
key_files:
  created:
    - packages/extension/lib/engine/nomination-strategy.ts
    - packages/extension/lib/__tests__/nomination-strategy.test.ts
  modified:
    - packages/extension/lib/engine/index.ts
decisions:
  - Hoisted player pool building, SGP computation, opponent model, and remainingSlots out of
    computeRosterOptimization and into computeDraftEngine (option a) so Step 7 simulation
    can reuse the same data without recomputation overhead
  - Skip simulation when draftProgressFraction < 0.1 (< 10% picks made) — too many remaining
    picks makes it expensive with minimal signal quality early in draft
  - Used ForwardSimulationSignal['nominationStrategy'] as type annotation to avoid complex
    conditional type that caused TS2322 assignment error
  - aggregateOutcomes imported from decision-comparison.ts (not re-exported elsewhere) for
    baseline win probability computation
metrics:
  duration: 5min
  completed: 2026-03-06
  tasks_completed: 2
  files_changed: 3
---

# Phase 28 Plan 02: Nomination Strategy and Simulation Wiring Summary

Nomination strategy module created with heuristic trap scoring, and the full forward simulation engine wired into computeDraftEngine as Step 7 with caching keyed on pick count + nomination.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create nomination-strategy.ts with heuristic trap scoring and tests | 93d9499 | nomination-strategy.ts, nomination-strategy.test.ts |
| 2 | Wire forward simulation into computeDraftEngine orchestrator with caching | 0bac37d | index.ts |

## What Was Built

### nomination-strategy.ts

Pure function `recommendNomination` that scores available players as trap nominations using three factors:

1. **Budget drain factor (0-0.4):** `min(0.4, player.dollars / 50)` — expensive players drain opponent budget
2. **Opponent need factor (0-0.3):** normalized count of opponents who still have slots open at this player's positions — positions with many competing teams = bidding wars expected
3. **My non-need factor (0-0.3):** `0.3 * (1 - myNeedScore)` — rewards nominating players at positions already filled

`trapScore = budgetDrainFactor + opponentNeedFactor + myNonNeedFactor`, floored at 0.01. Returns sorted top-N with player name, reason string, expectedDrain, and trapScore.

### index.ts — Player Pool Hoisting

Extracted the player pool building, SGP vector computation, opponent model construction, and remaining slot calculation OUT of `computeRosterOptimization` and into `computeDraftEngine`. Both optimization (Step 6) and simulation (Step 7) now reuse these values without redundant computation.

`computeRosterOptimization` now accepts `allPlayers`, `sgpValues`, `opponentModel`, `activeSlots`, `remainingSlots`, `needByPosition`, `weakCategories` as parameters.

### index.ts — buildSimDraftState

New helper function that constructs a `SimDraftState` for forward simulation:
- **availableIndices:** built from allPlayers filtered against drafted normalized names
- **teamStates:** one `SimTeamState` per team — my team uses `myRemainingSlots` and `input.remainingBudget`; opponents use proportional slot approximation from pick count
- **categoryTotals:** seeded from `leagueAnalysis.teamDraftedTotals` for accurate mid-draft win probability (critical — without seeding, all teams start from zero and probabilities are distorted)
- **componentTotals:** seeded from `leagueAnalysis.teamDraftedComponents` for correct rate stat computation (ERA, WHIP)

Returns `null` when `myTeamId` is null or fewer than 3 teams.

### index.ts — Step 7: Forward Simulation

Added as Step 7 after roster optimization in `computeDraftEngine`:
- Cached by `allPicks.length + '_' + currentAuctionPlayerId`
- Skipped when draft progress < 10% complete (`allPicks.length < 0.1 * totalTeams * rosterSize`)
- Runs 200 baseline simulations to compute `winProbability` (`SimulationOutcome`)
- When a player is nominated and `maxBid > 0`, runs `compareDecisions` for bid vs pass `currentDecision`
- Calls `recommendNomination` for `nominationStrategy` (top 5 trap nominations)
- Warns when simulation takes > 800ms
- Wrapped in try/catch — returns `simulation: null` on failure, never crashes engine

### Re-exports

Added `ForwardSimulationSignal`, `SimulationOutcome`, `NominationRecommendation`, `DecisionComparison` to the `export type` line from `index.ts` for consumption by the UI layer (Plan 03).

## Verification

- `npx tsc --noEmit -p packages/extension/tsconfig.json` — zero errors in our new files
- All 139 vitest tests pass (11 test files), including 4 new nomination-strategy tests
- `DraftEngineSignals.simulation` field populated with `ForwardSimulationSignal | null`
- No regressions in inflation, scarcity, budget, optimization, or projected standings steps

## Deviations from Plan

None - plan executed exactly as written. The complex `typeof simulation extends null ? null : ...` type annotation caused TS2322 and was simplified to `ForwardSimulationSignal['nominationStrategy']` — this is a minor fix, not a deviation.

## Self-Check: PASSED

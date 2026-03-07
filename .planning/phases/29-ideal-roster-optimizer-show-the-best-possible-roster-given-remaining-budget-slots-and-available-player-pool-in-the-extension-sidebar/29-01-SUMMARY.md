---
phase: 29-ideal-roster-optimizer
plan: 01
subsystem: extension-engine
tags: [ideal-roster, sgp, rank-boost, optimizer, tier-classification]
dependency_graph:
  requires:
    - packages/extension/lib/engine/roster-optimizer.ts (optimizeRoster greedy knapsack)
    - packages/extension/lib/engine/rank-boost.ts (computeExternalRankBoost)
    - packages/extension/lib/engine/types.ts (PoolPlayer, RosterOptimizationResult)
  provides:
    - IdealRosterPlayer type
    - IdealRosterSignal type
    - DraftEngineSignals.idealRoster field
    - computeIdealRoster function
  affects:
    - packages/extension/lib/engine/index.ts (hoisted nameToExternalRank, new cache, new step 6b)
    - packages/extension/lib/engine/types.ts (two new interfaces, extended DraftEngineSignals)
tech_stack:
  added: []
  patterns:
    - greedy knapsack roster optimization with locked players and rank-boosted SGP
    - module-level cache keyed on allPicks.length for pick-triggered invalidation
    - hoisted shared computation (nameToExternalRank) to parent scope for reuse without duplication
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
decisions:
  - "nameToExternalRank hoisted to computeDraftEngine scope and passed as parameter to computeRosterOptimization — eliminates duplicate Map build, shares single source with computeIdealRoster"
  - "totalBudget = remainingBudget + lockedTotalCost passed to optimizeRoster — optimizer subtracts locked costs internally, no double-counting"
  - "Cache keyed on allPicks.length (not nomination) — ideal roster only changes when a pick is made, not when nomination changes"
  - "tier thresholds: anchor >$20, core $5-$20, value <$5 — per plan locked decisions"
  - "IdealRosterSignal exported from index.ts so consuming components can type-check without importing from types.ts directly"
metrics:
  duration: 3min
  completed: 2026-03-07
  tasks_completed: 2
  files_modified: 2
---

# Phase 29 Plan 01: Ideal Roster Optimizer Types and Engine Function Summary

Data layer for the ideal roster display: IdealRosterPlayer/IdealRosterSignal types added to types.ts; computeIdealRoster function using rank-boosted SGP + locked myRoster players + greedy knapsack optimizer added to index.ts.

## What Was Built

**Task 1 — Types (types.ts)**

Added two new interfaces and extended DraftEngineSignals:

- `IdealRosterPlayer`: name, positions, dollars, tier ("anchor" | "core" | "value"), isLocked, sgpValue
- `IdealRosterSignal`: players[], totalSGPValue, budgetUsed, unfilledSlots, anchorCount, coreCount, valueCount, computeTimeMs
- `DraftEngineSignals.idealRoster: IdealRosterSignal | null` — added as the last field after `simulation`

**Task 2 — Engine function and wiring (index.ts)**

Three changes:

1. **Hoisted `nameToExternalRank`**: Moved from local variable inside `computeRosterOptimization()` to `computeDraftEngine()` scope as `nameToExternalRankOpt`. Added as parameter to `computeRosterOptimization()` signature. Now shared with `computeIdealRoster()` without duplication.

2. **Added `computeIdealRoster()` function** (placed between `computeRosterOptimization` and `computeDraftEngine`):
   - Applies `computeExternalRankBoost()` to each player's raw SGP for adjusted values
   - Builds locked players from `input.myRoster` by name-matching against the FG pool
   - Calls `optimizeRoster(allPlayers, adjustedSgpValues, remainingBudget + lockedTotalCost, remainingSlots, lockedPlayers)` — total budget passed prevents double-counting
   - Maps result.roster to `IdealRosterPlayer[]` with tier classification via `classifyTier()`
   - Returns null when allPlayers is empty or leagueCategories is empty

3. **Cache variables and wiring**: Added `cachedIdealRoster`/`idealRosterCacheKey` module-level variables; step 6b in `computeDraftEngine()` checks cache and calls `computeIdealRoster()`; `idealRoster` added to return object.

Also added `classifyTier()` helper function:
- `dollars > 20` → "anchor"
- `dollars >= 5` → "core"
- else → "value"

## Verification Results

1. `npx tsc --noEmit -p packages/extension/tsconfig.json` — zero errors in engine files (packages/extension/lib/engine/*)
2. `IdealRosterSignal` exists in types.ts with all required fields
3. `computeIdealRoster` exists in index.ts (confirmed via grep)
4. `DraftEngineSignals.idealRoster` populated in `computeDraftEngine()` return
5. `nameToExternalRank` built once in `computeDraftEngine()`, passed as parameter to both `computeRosterOptimization` and `computeIdealRoster`
6. `computeExternalRankBoost()` applied to SGP values in `computeIdealRoster()` before calling `optimizeRoster()`
7. Locked players built from `input.myRoster` with `isLocked: true` classification
8. Cache uses `allPicks.length` as key

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `packages/extension/lib/engine/types.ts` — modified, contains IdealRosterPlayer and IdealRosterSignal
- `packages/extension/lib/engine/index.ts` — modified, contains computeIdealRoster and idealRoster in return
- Commit 335c46d — Task 1 types commit
- Commit f3b946b — Task 2 engine function commit

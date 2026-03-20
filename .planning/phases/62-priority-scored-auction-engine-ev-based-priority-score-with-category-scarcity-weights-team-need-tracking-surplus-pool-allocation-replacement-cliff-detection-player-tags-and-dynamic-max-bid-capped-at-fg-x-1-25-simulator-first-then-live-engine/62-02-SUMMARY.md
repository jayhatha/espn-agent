---
phase: 62
plan: "02"
title: "Dynamic Category State — Scarcity, Pace, Surplus, Cliff Detection"
subsystem: extension-engine
tags: [tdd, category-state, scarcity, surplus, cliff-detection]
dependency_graph:
  requires: []
  provides: [category-state.ts, CategoryState interface]
  affects: [types.ts, engine/index.ts (future wiring)]
tech_stack:
  added: []
  patterns: [module-level cache with leagueId invalidation, pure function with test-reset export]
key_files:
  created:
    - packages/extension/lib/engine/category-state.ts
    - packages/extension/lib/engine/__tests__/category-state.test.ts
  modified:
    - packages/extension/lib/engine/types.ts
decisions:
  - "LOWER_BETTER scarcity uses inverted ratio (initialMedian/remainingMedian) so worsening ERA increases scarcity weight"
  - "Cliff detection sorts contributors by stat value (not FG$) to find the top specialist per category before computing FG$ dropoff"
  - "CategoryState.forceAcquisitionCategories added here (not plan 01) as noted in plan spec"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-20"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 62 Plan 02: Dynamic Category State — Scarcity, Pace, Surplus, Cliff Detection Summary

Pure function module computing `CategoryState` once per pick: LOWER_BETTER scarcity via inverted pool-median ratio, pace tracking with force-acquisition flags, surplus pool from bargain wins, and cliff detection using per-stat contributor sorting.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 (TDD RED) | Write failing tests for category-state.ts | 709b205 | `__tests__/category-state.test.ts`, `types.ts` |
| 2 (TDD GREEN) | Implement category-state.ts | 77fca19 | `category-state.ts` |

## What Was Built

`packages/extension/lib/engine/category-state.ts` — a pure function module (with module-level leagueId cache) that computes `CategoryState`:

- **Scarcity weights**: HIGHER_BETTER stats use sum ratio; LOWER_BETTER (ERA, WHIP) use inverted pool-median ratio (initial/remaining), so worsening remaining ERA increases scarcity weight. All weights clamped [1.0, 2.0].
- **Pace tracking**: HIGHER_BETTER = myTotal/target; LOWER_BETTER = target/myTotal (inverted). Defaults to 1.0 when target or myTotal is missing/zero.
- **Force acquisition**: Categories with paceRatio < 0.80 after >20% of draft picks made are added to `forceAcquisitionCategories`.
- **Surplus pool**: Sum of max(0, FG$ - paid) for all my drafted players where FG$ > 0.
- **Cliff detection**: For each of SB/SV/HR/K, finds contributors in undrafted pool sorted by stat value (not FG$). If top contributor's FG$ is $5+ above second contributor's FG$, adds to `cliffPlayers` as string (normalizedName).
- **Module-level cache**: `cachedLeagueId` + `cachedInitialPoolStats` — invalidated when leagueId changes. `resetCategoryStateCache()` exported for test use only.

`CategoryState` and `PriorityScoreResult` interfaces added to `types.ts` (plan 01's responsibility, done here since plan 02 was executed first in this session).

## Test Results

All 27 tests in `category-state.test.ts` pass:
- Scarcity weight tests (6): ratio computation, clamping, LOWER_BETTER inversion
- Pace tracking tests (5): HIGHER_BETTER/LOWER_BETTER formulas, defaults, force acquisition
- Surplus pool tests (4): accumulation, overpay guard, replacement-level guard
- Cliff detection tests (5): dropoff threshold, per-category separation, drafted player exclusion
- Serialization tests (3): plain object, string[], JSON.stringify safe
- Cache tests (2): same leagueId reuse, different leagueId invalidation

## Decisions Made

1. **LOWER_BETTER scarcity uses initialMedian/remainingMedian** (inverted from plan description but matching test intent): when remaining pool ERA worsens, ratio drops below 1, weight rises above 1. This correctly signals scarcity of good pitching.

2. **Cliff detection sorts by stat value, not FG$**: sorting by FG$ caused false negatives when a multi-skill player (e.g., SB=1 + high FG$) displaced the true second SB specialist. Sorting by the stat ensures the actual top contributors are compared.

3. **`forceAcquisitionCategories` field added to CategoryState here**: Plan 01 defined CategoryState without this field; plan 02 spec noted it should be added. Added both the interface field and the implementation here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LOWER_BETTER scarcity ratio direction fixed**
- **Found during:** Task 2 (GREEN phase, 2 tests failing)
- **Issue:** Plan spec said `ratio = remainingMedian / initialMedian` but this produces ratio > 1 when ERA worsens, clamping weight to 1.0 (no scarcity signal). Tests expected weight > 1.0 when remaining ERA worsens.
- **Fix:** Inverted to `ratio = initialMedian / remainingMedian` — semantically correct (scarcity of good pitching increases as pool quality drops).
- **Files modified:** `category-state.ts`
- **Commit:** 77fca19

**2. [Rule 1 - Bug] Cliff detection sort by stat value instead of FG$**
- **Found during:** Task 2 (GREEN phase, 1 test failing)
- **Issue:** Sorting SB contributors by FG$ placed a player with SB=1 but high FG$ as second contributor, compressing the apparent dropoff.
- **Fix:** Sort by `player.stats[statKey]` descending — identifies true specialists per stat category.
- **Files modified:** `category-state.ts`
- **Commit:** 77fca19

## Self-Check: PASSED

- FOUND: `packages/extension/lib/engine/category-state.ts`
- FOUND: `packages/extension/lib/engine/__tests__/category-state.test.ts`
- FOUND: commit `709b205` (TDD RED)
- FOUND: commit `77fca19` (TDD GREEN)

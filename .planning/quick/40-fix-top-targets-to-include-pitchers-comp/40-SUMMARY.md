---
phase: quick-40
plan: "01"
subsystem: extension-engine
tags: [roster-optimization, top-targets, pitcher-hitter-balance, sgp]
dependency_graph:
  requires: [packages/extension/lib/engine/types.ts]
  provides: [proportional-top-targets-in-roster-optimization]
  affects: [packages/extension/lib/engine/index.ts]
tech_stack:
  added: []
  patterns: [proportional-pool-split, fallback-fill, clamped-proportions]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts
decisions:
  - "pitcherCount = round(5 * pitcherSlots / activeTotal) then clamped to [1,4] ensures at least 1 of each type when both pools have players"
  - "hitterPool / pitcherPool indexed independently by SGP descending so each sub-pool surfaces best-available first"
  - "empty-pool fallback sets one count to 5 and the other to 0 to handle pitchers-only or hitters-only edge cases"
  - "overflow fill passes remaining slots from the short pool to the other pool so output is always exactly 5 targets"
metrics:
  duration: "2min"
  completed: "2026-03-05"
  tasks: 1
  files: 1
---

# Quick Task 40: Fix Top Targets to Include Pitchers Summary

Proportional hitter/pitcher top targets selection in `computeRosterOptimization` using `PoolPlayer.isPitcher` pool split with SGP-sorted sub-pools and clamped proportion math.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Split top targets into proportional hitter/pitcher pools | 91f7474 | packages/extension/lib/engine/index.ts |

## What Was Built

Replaced the flat top-5-by-SGP selection in `computeRosterOptimization` with a two-pool approach:

1. Compute `pitcherSlots = activeSlots["P"] ?? 0` and derive `pitcherCount = Math.round(5 * pitcherSlots / activeTotal)`, clamped to [1, 4]
2. Split `allPlayers` into `hitterPool` (isPitcher=false) and `pitcherPool` (isPitcher=true), each sorted SGP descending
3. Handle edge cases: if either pool is empty, all 5 targets come from the non-empty pool
4. If one pool has fewer than its allotted count, the remainder is filled from the other pool
5. Merge `[...topHitters, ...topPitchers]` and pass to the existing `topTargets` mapping block (unchanged)

**Standard roster math (14 hitter / 9 pitcher slots, total 23):**
- `pitcherCount = Math.round(5 * 9/23) = Math.round(1.957) = 2`
- `hitterCount = 5 - 2 = 3`
- Result: 3 best hitters (by SGP) + 2 best pitchers (by SGP)

## Deviations from Plan

None — plan executed exactly as written. Removed the unused `hitterSlots` intermediate variable during implementation cleanup (minor tidiness fix, not a deviation).

## Self-Check: PASSED

- `packages/extension/lib/engine/index.ts` modified and verified present
- Commit 91f7474 confirmed in git log
- `pnpm --filter extension exec tsc --noEmit` produces zero errors in `lib/engine/index.ts` (pre-existing errors in other files unrelated to this change)
- Proportional math verified: standard 14-hitter/9-pitcher roster yields pitcherCount=2, hitterCount=3
- `isPitcher` used in both `hitterPool` and `pitcherPool` filter expressions (plan artifact criterion met)

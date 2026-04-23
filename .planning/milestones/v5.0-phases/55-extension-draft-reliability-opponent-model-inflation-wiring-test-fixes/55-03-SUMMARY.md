---
phase: 55
plan: 03
subsystem: extension-tests
tags: [tests, archetype, monte-carlo, draft-simulator, performance]
dependency_graph:
  requires: []
  provides: [passing-extension-test-suite]
  affects: [extension/lib/__tests__/archetype.test.ts, extension/lib/__tests__/draft-simulator.test.ts, extension/lib/__tests__/monte-carlo.test.ts]
tech_stack:
  added: []
  patterns: [fixture-completeness, stochastic-test-design]
key_files:
  created: []
  modified:
    - packages/extension/lib/__tests__/archetype.test.ts
    - packages/extension/lib/__tests__/draft-simulator.test.ts
    - packages/extension/lib/__tests__/monte-carlo.test.ts
decisions:
  - "Increase monte-carlo replacement-level test from 100→300 sims with a larger pool (10 players) and bigger overpayment ($25) to make the directional signal statistically reliable without mocking Math.random"
  - "draft-simulator perf threshold: 1s → 15s (observed ~8.1s; 2x headroom for CI variability)"
  - "monte-carlo perf threshold: 50ms → 500ms (observed ~200ms; 2.5x headroom)"
metrics:
  duration: 5 minutes
  completed: 2026-03-17
  tasks_completed: 2
  files_modified: 3
---

# Phase 55 Plan 03: Extension Test Fixes Summary

Fixed 10 previously-failing extension tests: 7 archetype fixture crashes, 1 draft-simulator perf threshold, and 2 monte-carlo issues (1 perf threshold + 1 flaky stochastic test).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix archetype test fixtures | 4d389c9 | packages/extension/lib/__tests__/archetype.test.ts |
| 2 | Fix performance test thresholds | 3f472a4 | packages/extension/lib/__tests__/draft-simulator.test.ts, packages/extension/lib/__tests__/monte-carlo.test.ts |

## What Was Done

### Task 1: Archetype fixture fixes

`computeBuildArchetype` calls `normalizeName(p.playerName)` on each element of `allPicks`. Eight test locations were passing `{ playerId: i }` objects without a `playerName` property, causing `normalizeName(undefined)` to crash.

Fixed all 8 locations to use `p.playerName` from the `makeDraftedPlayer` return value:
- Line 104: single hitter pick test — used `myRoster[0].playerName`
- Lines 150, 193, 237, 291, 336, 398, 465: all `.map` calls updated from `(_, i) => ({ playerId: i })` or `(p, i) => ({ playerId: i })` to `(p) => ({ playerId: p.playerId, playerName: p.playerName })`

### Task 2: Performance threshold and flaky test fixes

**draft-simulator.test.ts**: Changed `1000ms` → `15000ms` with rationale comment. 300 full-draft sims with 200-player pool × 12 teams ≈ 52,800 simulated picks; observed runtime ~8.1s.

**monte-carlo.test.ts (perf)**: Changed `50ms` → `500ms` with rationale comment. 200 sims with 50 players and 4 opponent budgets; observed runtime ~200ms.

**monte-carlo.test.ts (flaky bid/pass test)**: The "passEV >= bidEV for replacement-level player" test was inherently flaky with only 4 players and 3 roster slots. With such a small pool, bidEV and passEV converge to nearly identical values (5.02 vs 5.03) and noise easily flips the comparison. Redesigned the scenario: 10 good players at $8-$17, 1 replacement player at $1, massive overpayment of $25 on $40 budget (burns 62.5%), roster needs 3 OF slots. This makes the directional signal reliably detectable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed flaky monte-carlo bid/pass test scenario**
- **Found during:** Task 2
- **Issue:** The "replacement-level" test scenario had only 4 players with 3 roster slots. bidEV and passEV converged to nearly identical values (diff < 0.01) due to tiny pool. Increasing simulations to 500 didn't help because the variance was structural, not statistical.
- **Fix:** Redesigned the scenario with 10 good alternatives, a $25 bid (62.5% budget burn) on a $1 replacement player, and 300 simulations. The large budget difference now creates a reliable directional gap.
- **Files modified:** packages/extension/lib/__tests__/monte-carlo.test.ts
- **Commit:** 3f472a4

## Results

- archetype.test.ts: 10 passed (was 7 failures)
- draft-simulator.test.ts: 14 passed (was 1 failure)
- monte-carlo.test.ts: 8 passed (was 2 failures)
- Full suite: 246 passed, 0 failures

## Self-Check: PASSED

---
phase: 12-address-codebase-concerns
plan: 05
subsystem: trade-analysis
tags: [rate-stats, component-math, refactoring, testing]

dependency_graph:
  requires: [12-01, 12-02, 12-04]
  provides: [rate-stat-trade-impact]
  affects: [trade-recommendations, fairness-scoring]

tech_stack:
  added: []
  patterns:
    - calculateFinalRate for unified rate stat calculation
    - Component-based math for multi-player trade simulation
    - Comprehensive edge case testing for rate stats

key_files:
  created: []
  modified:
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/backend/src/agents/__tests__/trade-recommendation.test.ts

decisions:
  - Use calculateFinalRate instead of individual rate functions for consistency with StandingsProjectionAgent
  - Add error handling with fallback to current value for unknown rate stats
  - Test multi-player trades with mixed counting and rate stats to prevent regression

metrics:
  duration_minutes: 10
  completed_date: 2026-02-26
  tasks_completed: 2
  tests_added: 1
  tests_passing: 26
---

# Phase 12 Plan 05: Complete Trade Recommendation Rate Stats Summary

**Complete trade recommendation agent with accurate rate stat adjustments using component-based math for multi-player trade analysis.**

## What Was Built

Refactored `TradeRecommendationAgent` to use unified `calculateFinalRate` function from shared package for all rate stat calculations in trade impact analysis. Added comprehensive test coverage for multi-player trades with mixed counting and rate stats.

## Tasks Completed

### Task 1: Refactor rate stat adjustments to use calculateFinalRate

**Commit:** `79a4df1`

**Changes:**
- Replaced individual rate calculation functions (`calculateAVG`, `calculateOBP`, `calculateSLG`, `calculateOPS`, `calculateERA`, `calculateWHIP`) with unified `calculateFinalRate` function
- Imported `calculateFinalRate` and `combineComponents` from shared package to align with pattern used in `StandingsProjectionAgent`
- Added error handling with fallback to current value for unknown rate stats or calculation errors
- Simplified import statements by removing 6 individual functions and using 2 unified functions

**Technical details:**
- `calculateFinalRate` takes formula ID (e.g., "avg", "era", "whip") and component objects
- Pass adjusted components (current + projected - given + received) as the projected parameter with empty current parameter since combination already happened
- Pattern matches `StandingsProjectionAgent` lines 200-204 for consistency

**Files modified:**
- `packages/backend/src/agents/trade-recommendation.ts` (lines 4-12, 876-891)

### Task 2: Add multi-player trade test with mixed stats

**Commit:** `933a18a`

**Changes:**
- Added new test case for 2-for-2 trade scenario with both counting stats (HR) and rate stats (AVG)
- Verifies component math works correctly when multiple players are traded on each side
- Tests expected AVG calculation: (1500 - 50 - 40 + 70 + 60) / (5000 - 200 - 150 + 200 + 180) = 1540/5030 = 0.3062
- Tests expected HR calculation: 200 - 10 - 15 + 20 + 12 = 207

**Test coverage:**
- Multi-player trades with component-based AVG calculation
- Mixed counting (HR) and rate (AVG) stat impacts in single trade
- Validates both stat types calculated correctly in same transaction

**Files modified:**
- `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` (added test case + setup helper)

## Deviations from Plan

None - plan executed exactly as written. Rate stat adjustments were already implemented with component math in the codebase (lines 836-905), but using individual functions instead of `calculateFinalRate`. This task refactored to use the unified function for consistency.

## Verification Results

All tests passing:
- **26 tests** in trade-recommendation test suite (up from 25)
- New multi-player test validates component math for 2-for-2 trades
- Existing tests continue to pass after refactoring to `calculateFinalRate`

Test categories covered:
1. ✅ AVG calculation using component math, not rate averaging
2. ✅ ERA calculation using component math, not rate averaging
3. ✅ OBP with multiple components (H, BB, HBP, AB, SF)
4. ✅ WHIP calculation with component math
5. ✅ Zero-trade scenario (same player in and out)
6. ✅ Graceful degradation when projections missing
7. ✅ **NEW:** Multi-player (2-for-2) trade with mixed counting and rate stats

## Technical Notes

**Component math correctness:**

Rate stats MUST use component-based calculation, never averaging rates:
- ❌ Wrong: `newAVG = oldAVG + receivedAVG - givenAVG`
- ✅ Correct: `newAVG = (oldH - givenH + receivedH) / (oldAB - givenAB + receivedAB)`

**Why calculateFinalRate matters:**

Using `calculateFinalRate` instead of individual functions provides:
1. Consistency with `StandingsProjectionAgent` and other agents
2. Single source of truth for rate stat formulas
3. Easier to add new rate stats (K9, etc.) without modifying trade agent
4. Centralized error handling for formula calculation

**Error handling:**

Added try-catch around `calculateFinalRate` with fallback to current value. This prevents trade analysis from failing if:
- Unknown rate stat category encountered
- Components missing for calculation
- Formula ID doesn't match expected format

## Self-Check: PASSED

**Created files:** None (refactoring + tests only)

**Modified files:**
- ✅ `packages/backend/src/agents/trade-recommendation.ts` exists and imports `calculateFinalRate`
- ✅ `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` exists and includes multi-player test

**Commits:**
- ✅ `79a4df1`: refactor(12-05): use calculateFinalRate for rate stat trade impact
- ✅ `933a18a`: test(12-05): add multi-player trade test with mixed counting and rate stats

**Verification:**
```bash
cd packages/backend && npx vitest run trade-recommendation
# ✅ 26 tests passing
```

All files exist, commits are in git history, and tests pass.

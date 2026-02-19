---
phase: 01
plan: 03
subsystem: trade-recommendations
tags: [rate-stats, component-math, tdd, calculations]
dependencies:
  requires: []
  provides:
    - rate-stat-component-math
  affects:
    - trade-impact-analysis
    - trade-recommendations
tech-stack:
  added:
    - "@espn-fantasy/shared formulas (calculateAVG, calculateOBP, calculateSLG, calculateOPS, calculateERA, calculateWHIP)"
  patterns:
    - component-based rate stat calculations
    - TDD methodology (RED-GREEN-REFACTOR)
key-files:
  created:
    - packages/backend/src/agents/__tests__/trade-recommendation.test.ts
  modified:
    - packages/backend/src/agents/trade-recommendation.ts
decisions:
  - title: Import shared formula functions instead of duplicating logic
    rationale: DRY principle - formulas already exist in shared package
    alternatives: Inline formula calculations in trade-recommendation.ts
  - title: Store original values separately before trade simulation
    rationale: CategoryImpact needs both pre-trade (currentValue) and post-trade (projectedValue)
    alternatives: Calculate currentValue from components later (more complex)
  - title: Use explicit switch statement for rate stat mapping
    rationale: Clear, maintainable, and easy to extend with new rate stats
    alternatives: Dynamic formula lookup table (more complex, less type-safe)
metrics:
  duration: 15 minutes
  completed: 2026-02-19
  commits: 2
  files_created: 1
  files_modified: 1
  tests_added: 6
---

# Phase 01 Plan 03: Fix Trade Simulation Rate Stat Component Math

Component-based rate stat calculations for trade simulations using TDD methodology - replaces broken TODO placeholder with working implementation.

## Objective

Fix the single most broken user-facing feature: trade impact analysis was returning 0 delta for all rate stats (AVG, OBP, SLG, OPS, ERA, WHIP) because the code had a TODO placeholder. Implement proper component-based calculations that adjust underlying stats (H, AB, IP, ER, etc.) instead of incorrectly averaging rates.

## Execution Summary

**Pattern:** TDD (RED → GREEN → no refactoring needed)

### RED Phase
Created comprehensive test suite with 6 test cases covering:
- AVG calculation (batting)
- ERA calculation (pitching)
- OBP with multiple components
- WHIP calculation
- Zero-trade scenario (same player in/out)
- Graceful degradation when projections missing

Built sophisticated mock database helper that handles complex Kysely query chains including multiple joins.

**Commit:** `9c3ec2d` - All tests failing as expected

### GREEN Phase
Replaced TODO block (lines 612-624) with working implementation:

1. **Imported formula functions** from `@espn-fantasy/shared`:
   - calculateAVG, calculateOBP, calculateSLG, calculateOPS
   - calculateERA, calculateWHIP

2. **Component adjustment logic**:
   - Start with team's current projected components
   - Subtract RoS components for each traded-away player
   - Add RoS components for each acquired player
   - Calculate final rate from adjusted components

3. **Fixed CategoryImpact reporting**:
   - Store original pre-trade values in `originalValues` Map
   - Use original values for `currentValue` field
   - Use adjusted post-trade values for `projectedValue` field

**Commit:** `5104903` - All tests passing

### REFACTOR Phase
No refactoring needed. Code is clean, well-commented, and follows existing patterns.

## Test Coverage

All 6 tests passing:

| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| AVG component math | 0.304 | 0.304 | ✅ |
| ERA component math | 2.8875 | 2.8875 | ✅ |
| OBP multi-component | 0.3644 | 0.3644 | ✅ |
| WHIP calculation | 1.2292 | 1.2292 | ✅ |
| Zero-trade delta | 0.0 | 0.0 | ✅ |
| Missing projections | preserved | preserved | ✅ |

## Deviations from Plan

None - plan executed exactly as written.

## Blockers/Issues

**Out-of-scope TypeScript errors:** Pre-existing compilation errors in unrelated files:
- `src/api/auth.ts` - authenticate property errors
- `src/middleware/auth.ts` - user type declaration conflicts
- kysely type definitions - private identifier errors

Per deviation rules, these are out-of-scope warnings as they exist in unrelated files and don't affect this plan's implementation.

## Verification

✅ All 6 test cases pass
✅ Rate stat trade deltas are mathematically correct (component math, not rate averaging)
✅ Trade simulation for AVG, OBP, SLG, OPS, ERA, WHIP returns non-zero deltas when players have different profiles
✅ Existing counting stat logic unchanged
✅ Zero-trade scenario returns zero delta
✅ Missing projections handled gracefully (preserves current value)

## Impact

**Before:** Trade recommendations were useless - all rate stat deltas showed 0 because TODO placeholder preserved original values.

**After:** Trade recommendations now accurately calculate rate stat impacts:
- Trading a .250 hitter for a .350 hitter correctly shows AVG improvement
- Trading a 3.60 ERA pitcher for a 2.70 ERA pitcher correctly shows ERA improvement
- Multi-component stats (OBP, OPS) correctly adjust all underlying components

**User-facing benefit:** Trade analysis is now actionable - users can trust the projected standings impact for rate stat categories.

## Key Insights

1. **Mock complexity:** Handling Kysely's fluent query chains with multiple joins required a sophisticated mock that tracks join tables in an array, creating composite keys like `player_projection_projections_run_player_list`.

2. **CategoryImpact semantics:** The `CategoryImpact` interface has both `currentValue` and `projectedValue` fields. After trade simulation, both were incorrectly pointing to the post-trade value because `userTeamCategories` was being modified in-place. Solution: store original values in a separate Map before simulation.

3. **Component key normalization:** Database stores components with uppercase keys (H, AB, IP, ER) in `stat_components_json`, while also storing lowercase flat fields (h, ab, ip, er) for `isCategoryRelevant` checks. Implementation correctly uses `stat_components_json` for component math and lowercase fields for relevance checking.

## Next Steps

This completes the rate stat calculation fix. Future work:
- **Plan 01-04:** Multi-player trade combinatorics may benefit from this component math foundation
- **Plan 03-XX:** Matchup-specific projections could extend this to adjust components based on park factors

## Self-Check: PASSED

**Files created:**
- ✅ packages/backend/src/agents/__tests__/trade-recommendation.test.ts exists

**Files modified:**
- ✅ packages/backend/src/agents/trade-recommendation.ts contains calculateAVG import
- ✅ packages/backend/src/agents/trade-recommendation.ts contains component adjustment logic

**Commits:**
- ✅ 9c3ec2d exists (test commit)
- ✅ 5104903 exists (implementation commit)

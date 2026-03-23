# Plan 66-01 Summary: Roto Math Engine + API Delta

**Status:** COMPLETE
**Date:** 2026-03-23

## What was done

### Task 1: Pure functions in shared/formulas.ts
- Added `TeamCategoryProjection` interface and `MarginalGain` interface
- Added `interpolateRotoPoints()` — ranks teams by category value, assigns `numTeams - rank + 1` roto points, matching backend `rankAndStore` logic
- Added `computeMarginalGains()` — for each category, finds the team immediately above in rank and computes the absolute gap, sorted by smallest gap first
- Edge cases: rank 1 teams get `teamAbove: null` and `gap: 0`, placed last in sort; empty input returns empty array
- Rate stat gaps expressed as raw rate differential (component-level conversion deferred to Phase 67)

### Task 2: Enhanced standings/projected API endpoint
- Added query for previous snapshot date via `league_daily_snapshot` table
- Added query for previous `team_daily_projected_overall` data when previous snapshot exists
- Added `previousSnapshotDate: string | null` to top-level response
- Added `previousProjectedPoints: number | null` and `pointsDelta: number | null` to each overall standing entry
- When no previous snapshot exists, all delta fields are null (no crash)
- All existing response fields unchanged (backward compatible)

## Verification
- `cd packages/shared && npx tsc --noEmit` — passes
- `cd packages/backend && npx tsc --noEmit` — passes
- All three exports confirmed in formulas.ts: `interpolateRotoPoints`, `computeMarginalGains`, `MarginalGain`
- Delta fields confirmed in timeseries.ts: `pointsDelta`, `previousProjectedPoints`, `previousSnapshotDate`

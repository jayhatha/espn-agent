---
phase: 68
plan: 01
subsystem: extension/data-pipeline
tags: [wpct, fangraphs, sgp, category-mapping, pitcher-stats]
dependency_graph:
  requires: []
  provides: [WPCT-category-detection, L-in-pitcher-data, WPCT-precomputed-rate]
  affects: [sgp-engine, archetype-pool-builder, draft-config-detector]
tech_stack:
  added: []
  patterns: [precomputed-rate-stat, w-l-losses-pipeline]
key_files:
  created: []
  modified:
    - packages/extension/lib/draft-config-detector.ts
    - packages/extension/lib/engine/sgp.ts
    - packages/extension/lib/fangraphs-data.ts
    - packages/extension/scripts/convert-fangraphs-csvs.ts
    - packages/extension/lib/engine/archetype.ts
    - packages/extension/lib/__tests__/draft-config-detector.test.ts
    - packages/extension/lib/__tests__/archetype.test.ts
    - packages/extension/assets/fangraphs-leaderboard-pitchers.json
decisions:
  - "WPCT precomputed in pool builder (not recomputed in SGP engine) — consistent with ERA/WHIP pattern"
  - "L field added as required (not optional) to FgPitcherProjection — all pitchers have L in FanGraphs CSV"
metrics:
  duration: 7min
  completed: 2026-03-08
  tasks_completed: 2
  files_modified: 8
---

# Phase 68 Plan 01: WPCT End-to-End Fix Summary

**One-liner:** Thread Losses (L) through the FanGraphs data pipeline and add WPCT = W/(W+L) as a precomputed rate stat recognized by category mapping and SGP engine.

## What Was Built

WPCT (Winning Percentage) was completely absent from the extension's data pipeline. Users whose ESPN leagues use WPCT as a scoring category saw zero contribution from it to auction values and SGP calculations. This fix wires WPCT end-to-end:

1. **Category detection** — `mapStatNameToCategory("WPCT")` now returns the correct RATE/HIGHER_BETTER definition with `formula_id: "wpct"` and `required_components: ["W", "L"]`
2. **SGP recognition** — `PITCHING_STAT_KEYS` in sgp.ts now includes "WPCT", so the SGP engine correctly identifies it as a pitcher category
3. **FanGraphs data interface** — `FgPitcherProjection` interface gains `L: number` field
4. **CSV extraction** — `convertPitcherLeaderboard()` now extracts `L: num(r["L"])` from the FanGraphs CSV (column "L" confirmed present)
5. **Pool builder** — Both the undrafted pitchers block and the drafted pitchers block in `archetype.ts` now copy `stats.L = proj.L` and precompute `stats.WPCT = W / (W + L)` using the same pattern as ERA/WHIP
6. **Regenerated JSON** — `fangraphs-leaderboard-pitchers.json` rebuilt with L field for all 810 pitchers

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add WPCT to category mapping and SGP recognition | 83bd534 | draft-config-detector.ts, sgp.ts, draft-config-detector.test.ts |
| 2 | Thread L through FanGraphs pipeline and compute WPCT in pool builder | 5764f71 | fangraphs-data.ts, convert-fangraphs-csvs.ts, archetype.ts, archetype.test.ts, fangraphs-leaderboard-pitchers.json |

## Verification

- All 120 extension tests pass: `10 test files, 120 tests`
- FanGraphs pitcher JSON: 810 pitchers, all 810 have L field
- Spot check: Tarik Skubal W=14, L=7, WPCT=0.667
- `mapStatNameToCategory("WPCT")` returns RATE/HIGHER_BETTER with formula_id "wpct"
- PITCHING_STAT_KEYS includes "WPCT"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FgPitcherProjection missing L in test fixture**
- **Found during:** Task 2 — TypeScript compilation check
- **Issue:** Adding `L: number` as required to `FgPitcherProjection` made the `makePitcher()` fixture in archetype.test.ts fail TS type check (L was absent from the fixture object)
- **Fix:** Added `L: 8` to the `makePitcher()` fixture defaults in `archetype.test.ts`
- **Files modified:** `packages/extension/lib/__tests__/archetype.test.ts`
- **Commit:** 5764f71

## Self-Check: PASSED

Files created/modified:
- FOUND: packages/extension/lib/draft-config-detector.ts
- FOUND: packages/extension/lib/engine/sgp.ts
- FOUND: packages/extension/lib/fangraphs-data.ts
- FOUND: packages/extension/scripts/convert-fangraphs-csvs.ts
- FOUND: packages/extension/lib/engine/archetype.ts
- FOUND: packages/extension/assets/fangraphs-leaderboard-pitchers.json

Commits:
- FOUND: 83bd534 (feat(68-01))
- FOUND: 5764f71 (feat(68-02))

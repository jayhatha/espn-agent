---
phase: 25-projected-standings-engine
plan: 01
subsystem: extension
tags: [draft-engine, projected-standings, roto, replacement-level, typescript, fangraphs]

# Dependency graph
requires:
  - phase: 21-build-archetype
    provides: buildFgPlayerPool, normalizeName, PoolPlayer from archetype.ts
  - phase: 41-league-analysis
    provides: computeLeagueAnalysis, teamTotals computation pattern
  - phase: 23-roster-optimization
    provides: PoolPlayer type in types.ts, DraftEngineSignals interface

provides:
  - ProjectedTeamStanding and ProjectedStandingsSignal interfaces in types.ts
  - computeProjectedStandings pure function in projected-standings.ts
  - computeReplacementStats: median-based undrafted player filler stats
  - computeDraftProgressWeight: piecewise linear confidence weight
  - computeRotoPts: roto points assignment per category
  - teamDraftedTotals exposed on LeagueAnalysisSignal (optional field)
  - projectedStandings: ProjectedStandingsSignal | null on DraftEngineSignals

affects:
  - 25-02-PLAN.md (will wire computeProjectedStandings into engine/index.ts and sidebar)
  - future phases using projected standings for strategic signals

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Median-based replacement level (not greedy fill) for unbiased filler stats
    - Piecewise linear confidence weight tied to draft completion percentage
    - Component-based rate stat filler (never average rates) using calculateFinalRate

key-files:
  created:
    - packages/extension/lib/engine/projected-standings.ts
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/league-analysis.ts
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "Median (not mean) undrafted pool stats for replacement level — outlier-resistant, prevents elite players skewing filler"
  - "Piecewise linear draft progress weight with 50% drafted = 0.5 confidence — standings meaningful but noisy at draft midpoint"
  - "teamDraftedTotals on LeagueAnalysisSignal is optional (?) — existing consumers unaffected, no breaking change"
  - "Minimum 3 teams guard in computeProjectedStandings (stricter than league-analysis 2-team minimum) — standings rankings require at least 3 data points to be meaningful"
  - "IP <= 0 guard prevents NaN/Infinity in ERA/WHIP when team has no pitchers yet drafted"
  - "projectedStandings: null in engine/index.ts return for now — Plan 02 will wire computeProjectedStandings into computeDraftEngine"
  - "Rate filler uses replacement components scaled to rosterSize — approximation since per-player component breakdown unavailable from teamDraftedTotals"

patterns-established:
  - "Replacement level filler: iterate all teams, add median-undrafted-component × remaining_slots for each rate formula component"
  - "ALL_COMPONENT_KEYS const covers all hitter and pitcher components for comprehensive median computation"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-06
---

# Phase 25 Plan 01: Projected Standings Engine Summary

**Median-based replacement-level projected standings engine with piecewise linear draft-progress confidence weight and roto point ranking across all teams**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T01:28:22Z
- **Completed:** 2026-03-06T01:35:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `projected-standings.ts` (401 lines) as a pure function module with zero React/Zustand/DOM imports
- Added `ProjectedTeamStanding` and `ProjectedStandingsSignal` interfaces to `types.ts`
- Exposed `teamDraftedTotals` from `computeLeagueAnalysis` as optional backwards-compatible field
- Added `projectedStandings: ProjectedStandingsSignal | null` to `DraftEngineSignals` (Plan 02 will wire)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add projected standings types and refactor league-analysis to expose teamDraftedTotals** - `9b18476` (feat)
2. **Task 2: Create projected-standings.ts — replacement-level filler, roto points, draft progress weight** - `e30cb93` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/extension/lib/engine/projected-standings.ts` - Pure function module: computeProjectedStandings, computeReplacementStats, computeDraftProgressWeight, computeRotoPts
- `packages/extension/lib/engine/types.ts` - Added ProjectedTeamStanding, ProjectedStandingsSignal interfaces; added projectedStandings to DraftEngineSignals; added teamDraftedTotals to LeagueAnalysisSignal
- `packages/extension/lib/engine/league-analysis.ts` - Expose teamDraftedTotals in return object and early-return path
- `packages/extension/lib/engine/index.ts` - Set projectedStandings: null in computeDraftEngine return (Plan 02 wire-up)

## Decisions Made
- Median (not mean) for replacement level: outlier-resistant so elite undrafted players don't skew filler stats upward
- teamDraftedTotals optional field: ensures existing consumers of LeagueAnalysisSignal are completely unaffected
- Minimum 3 teams guard: rankings require at least 3 data points; 1-2 teams produces degenerate standings
- Rate filler approximation: since teamDraftedTotals only contains rate values (not per-player components), rate filler uses replacement_component × rosterSize uniformly — this is correct for the "no FG data" case and a reasonable approximation for partial rosters
- projectedStandings: null in engine/index.ts return: avoids wiring complexity in Plan 01, Plan 02 does the full integration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing projectedStandings in computeDraftEngine return**
- **Found during:** Task 1 verification (TypeScript compilation)
- **Issue:** Adding `projectedStandings: ProjectedStandingsSignal | null` to `DraftEngineSignals` caused engine/index.ts return to fail type check (missing required property)
- **Fix:** Added `projectedStandings: null` to the return object in `computeDraftEngine` in `engine/index.ts`
- **Files modified:** packages/extension/lib/engine/index.ts
- **Verification:** `npx tsc --noEmit -p packages/extension/tsconfig.json` shows no new errors in our files
- **Committed in:** 9b18476 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary structural fix to prevent TypeScript build failure. Plan 02 will replace `null` with actual computation call.

## Issues Encountered
None beyond the deviation documented above.

## Next Phase Readiness
- All types in place: `ProjectedStandingsSignal`, `ProjectedTeamStanding` ready for Plan 02 consumption
- `computeProjectedStandings` pure function is ready to be called from `computeDraftEngine` in `engine/index.ts`
- `teamDraftedTotals` flows from `computeLeagueAnalysis` → ready for Plan 02 to pass into `computeProjectedStandings`
- Plan 02 needs to: call `computeProjectedStandings` in `computeDraftEngine`, add sidebar UI section for projected standings display

---
*Phase: 25-projected-standings-engine*
*Completed: 2026-03-06*

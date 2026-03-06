---
phase: 25-projected-standings-engine
plan: 02
subsystem: extension
tags: [draft-engine, projected-standings, roto, sidebar, typescript, weak-category-boost]

# Dependency graph
requires:
  - phase: 25-01
    provides: computeProjectedStandings pure function in projected-standings.ts, ProjectedStandingsSignal interface in types.ts, teamDraftedTotals on LeagueAnalysisSignal

provides:
  - computeProjectedStandings called as step 5c in computeDraftEngine with pick-count cache
  - Weak-category boost (30% per weak category, capped at 2x) applied to top-target SGP sorting in computeRosterOptimization
  - projectedStandings field populated (was null placeholder) in DraftEngineSignals return
  - ProjectedStandingsSignal re-exported from engine/index.ts
  - "Projected Standings" collapsible section in EngineInsights sidebar with rank table, category breakdown, and confidence badge

affects:
  - future phases consuming projectedStandings from DraftEngineSignals
  - DraftSidebar: displays EngineInsights with projected standings section

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pick-count cache invalidation for projected standings (same pattern as SGP cache and bid cache)
    - Weak-category boost as multiplicative modifier on top of positional need boost in indexedAll mapping
    - IIFE pattern in JSX for conditional multi-step rendering (myStanding lookup + category rank display)
    - Projected standings section guard: projectedStandings.teamsWithData >= 3 (mirrors 25-01 minimum 3 teams constraint)

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/components/EngineInsights.tsx

key-decisions:
  - "projectedStandings passed as parameter to computeRosterOptimization (not re-computed inside) — avoids double computation and keeps cache invalidation logic in one place (computeDraftEngine)"
  - "Weak-category boost applied after positional need boost (multiplicative layering) — both boosts are independent signals, multiplicative composition prevents either from being swamped"
  - "isMyTeam detection uses projectedOverallRank === myTeamRank (not teamId comparison) — avoids threading myTeamId into JSX; works correctly because ranks are unique"
  - "Confidence badge uses draftProgressWeight >= 0.5 for HIGH (not >= 0.2 for MED) — matches piecewise linear breakpoints where 0.5 draft completion = meaningful confidence"

patterns-established:
  - "Module-level cache tuple pattern: cachedX + xCacheKey pair, invalidated on pick count change — consistent across SGP/bid/projected-standings caches"
  - "Projected standings wiring: 5b (league analysis) -> 5c (projected standings, depends on 5b.teamDraftedTotals) -> 6 (optimization, uses 5c.myWeakCategories)"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-03-06
---

# Phase 25 Plan 02: Projected Standings Engine Wire-Up Summary

**Projected standings wired as step 5c with pick-count cache and weak-category boost (30%/2x cap) in top-target sorting; collapsible sidebar section shows roto rank table, per-category ranks, and confidence badge**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-06T02:04:40Z
- **Completed:** 2026-03-06T02:24:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired `computeProjectedStandings` as step 5c in `computeDraftEngine` after league analysis and before roster optimization
- Added pick-count cache for projected standings (invalidates on `allPicks.length` change, same pattern as SGP cache)
- Applied weak-category boost (30% per weak category this player contributes to, capped at 2x) to top-target SGP sorting in `computeRosterOptimization`
- Added "Projected Standings" collapsible section to `EngineInsights` with: all-team roto rank table, user row highlighted with `ring-1 ring-accent`, per-category ranks with color coding, and LOW/MED/HIGH confidence badge from `draftProgressWeight`
- Re-exported `ProjectedStandingsSignal` from `engine/index.ts` for external consumers

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire projected standings as step 5c in engine orchestrator with weak-category boost** - `f7578ec` (feat)
2. **Task 2: Add Projected Standings section to EngineInsights sidebar** - `5cd3e4f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/extension/lib/engine/index.ts` - Step 5c projected standings computation with cache, projectedStandings parameter to computeRosterOptimization, weak-category boost in indexedAll mapping, ProjectedStandingsSignal import and re-export
- `packages/extension/components/EngineInsights.tsx` - Projected Standings collapsible section: rank table (all teams), user row highlight, category ranks with color coding, weak/strong summary, confidence badge

## Decisions Made
- Passed `projectedStandings` as parameter to `computeRosterOptimization` rather than re-computing inside — keeps cache logic centralized in `computeDraftEngine`, avoids redundant computation
- Weak-category boost is multiplicative on top of positional need boost — both are independent signals that should compose; neither should swamp the other
- `isMyTeam` detection in JSX uses `projectedOverallRank === myTeamRank` instead of `teamId` comparison — avoids threading `myTeamId` into JSX while working correctly since ranks are unique

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Phase 25 is now complete: projected standings engine built (Plan 01) and wired into sidebar (Plan 02)
- `projectedStandings` field is populated in `DraftEngineSignals` with real data (not null placeholder)
- Weak-category boost means top targets are now tilted toward addressing the user's weakest projected roto categories
- Future phases can read `projectedStandings.myWeakCategories` / `myStrongCategories` from the narrator payload or other signal consumers

## Self-Check: PASSED

All claims verified:
- FOUND: packages/extension/lib/engine/index.ts
- FOUND: packages/extension/components/EngineInsights.tsx
- FOUND: 25-02-SUMMARY.md
- FOUND: f7578ec (Task 1 commit)
- FOUND: 5cd3e4f (Task 2 commit)
- computeProjectedStandings imported and called: 2 references
- projectedStandings in return object: 1 reference
- weakBoost applied: 4 references
- ProjectedStandingsSignal re-exported: 5 references
- teamsWithData >= 3 guard in EngineInsights: 1 reference

---
*Phase: 25-projected-standings-engine*
*Completed: 2026-03-06*

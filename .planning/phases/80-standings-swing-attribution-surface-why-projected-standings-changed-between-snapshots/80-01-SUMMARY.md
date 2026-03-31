---
phase: 80-standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots
plan: "01"
subsystem: backend-agents
tags: [attribution, standings, roto-math, tdd]
dependency_graph:
  requires:
    - packages/backend/src/utils/roto-ranking.ts (assignRanksWithTies)
    - packages/backend/src/db/schema.ts (Database type)
  provides:
    - StandingsSwingAttributionAgent class with computeSwing() method
    - Pure helper functions: computeActualPerformanceDelta, computeProjectionChangeDelta, attributeCompetitorMovement
    - Interfaces: SwingAttributionResult, CategoryAttribution
  affects:
    - packages/backend/src/api/timeseries.ts (Plan 02 will wire this in)
tech_stack:
  added: []
  patterns:
    - TDD RED→GREEN cycle with pure function extraction
    - Three-bucket sequential attribution (actual → projection → competitor residual)
    - Pitfall guards for same-run-ID and LOWER_BETTER direction
key_files:
  created:
    - packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts
    - packages/backend/src/agents/standings-swing-attribution.ts
  modified: []
decisions:
  - computeActualPerformanceDelta returns hypotheticalProjected map so computeProjectionChangeDelta can chain without recomputing
  - sameRunId guard short-circuits projection delta to 0 before any ranking (Pitfall 5 from RESEARCH.md)
  - attributeCompetitorMovement is a pure residual function (total - actual - projection)
  - determineBucket uses 0.01 threshold to distinguish "mixed" from single-bucket attribution
  - competitor_movement surface uses top absolute mover across all competitors (not rank-boundary-only)
metrics:
  duration: "~6 min"
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 80 Plan 01: StandingsSwingAttributionAgent (TDD) Summary

Three-bucket projected standings swing attribution agent with pure helper functions and 12 passing unit tests, covering actual_performance, projection_change, and competitor_movement decomposition with LOWER_BETTER direction support.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Write failing tests (RED) | 3da483f | packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts |
| 2 | Implement agent (GREEN) | ef702a3 | packages/backend/src/agents/standings-swing-attribution.ts |

## What Was Built

### Pure Helper Functions (exported, unit-tested)

**`computeActualPerformanceDelta`** — Given prevActuals, currActuals, allPrevProjected, direction, numTeams, myTeamId: builds a hypotheticalProjected map (prevProjected + actual accumulation delta per team), ranks both states using `assignRanksWithTies`, and returns the roto point delta attributable to YTD stat accumulation. Returns both `actualDelta` and `hypotheticalProjected` to enable chained attribution.

**`computeProjectionChangeDelta`** — Given hypotheticalProjected (from actual step), allCurrProjected, direction, sameRunId: if `sameRunId=true` returns 0 immediately (Pitfall 5 guard). Otherwise ranks hypothetical vs currProjected and returns the residual roto point delta from FanGraphs projection changes.

**`attributeCompetitorMovement`** — Pure residual: `total - actual - projection`. Any rank change not explained by own accumulation or own projection update is competitor movement.

### Agent Class

**`StandingsSwingAttributionAgent.computeSwing(leagueId, teamId, currDate)`** — Fetches all teams' projected category and actual totals for both dates in parallel, runs the three-bucket attribution loop per category, and returns a `SwingAttributionResult` including:
- `attribution_available: false` when no previous snapshot exists
- Per-category `CategoryAttribution` with bucket label and optional player/competitor names
- Aggregated `buckets: { actual_performance, projection_change, competitor_movement }`

### Six Test Behaviors Covered

1. Three-bucket sum equals total roto delta (round-trip verification)
2. Actual performance correctly isolates YTD accumulation (two sub-cases)
3. Projection change = 0 when sameRunId=true, non-zero when different runs
4. Competitor movement detected as residual when absolute value flat, rank improved
5. Attribution_available guard (pure function contract at zero total)
6. LOWER_BETTER categories (ERA, WHIP) — three sub-cases confirming positive roto delta on ERA decrease

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- [x] `packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts`
- [x] `packages/backend/src/agents/standings-swing-attribution.ts`

### Commits exist:
- [x] 3da483f — RED phase
- [x] ef702a3 — GREEN phase

### Exports verified:
- [x] `StandingsSwingAttributionAgent` class
- [x] `SwingAttributionResult` interface
- [x] `CategoryAttribution` interface
- [x] `computeActualPerformanceDelta` function
- [x] `computeProjectionChangeDelta` function
- [x] `attributeCompetitorMovement` function

### Key patterns verified:
- [x] `attribution_available` in agent file
- [x] `assignRanksWithTies` used (not custom sort)
- [x] `sameRunId` short-circuit guard
- [x] `LOWER_BETTER` direction handled

## Self-Check: PASSED

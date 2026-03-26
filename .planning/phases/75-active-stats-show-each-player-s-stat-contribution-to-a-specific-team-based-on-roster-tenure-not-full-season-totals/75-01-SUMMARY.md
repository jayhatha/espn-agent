---
phase: 75-active-stats
plan: 01
subsystem: api, database
tags: [player-stats, roster-tenure, postgresql, kysely, espn-api]

# Dependency graph
requires:
  - phase: 74-season-finalization
    provides: historical data caching patterns
provides:
  - player_period_stats table (migration 006) with per-player, per-period stats keyed by team
  - PlayerPeriodStats TypeScript type in shared/src/types.ts
  - writePlayerPeriodStats() method in snapshot orchestrator writes stats on every daily snapshot
  - GET /api/leagues/:id/teams/:teamId/roster returns tenureStats field (summed components while on team)
affects:
  - phase 75-02 (frontend display of tenure stats)
  - roster page
  - waivers page drop candidates

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESPN_PERIOD_STAT_MAP: separate map for counting stats only (RATE stats excluded, computed at read time)"
    - "OUTS -> IP conversion: store OUTS/3 as IP in components_json during ingest"
    - "Tenure aggregation: sum components_json across scoring periods WHERE team_id matches in API layer"

key-files:
  created:
    - packages/backend/src/db/migrations/006_add_player_period_stats.sql
  modified:
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/db/schema.ts
    - packages/shared/src/types.ts

key-decisions:
  - "player_period_stats PK is (league_id, scoring_period, player_id) — upserts overwrite team_id when player is traded mid-season"
  - "Only counting stats stored in components_json — rate stats (AVG, ERA, WHIP) computed from components at read time"
  - "ESPN OUTS stat (id=34) converted to IP via /3 during ingest, stored as IP in components_json"
  - "Tenure stats are raw component sums — frontend computes rate stats using existing formula functions"
  - "player.espn_player_id (not player.id) used for ESPN-to-DB player ID lookup — player.id is a DB surrogate key"

patterns-established:
  - "Per-player period stat extraction: espnPlayerIds collected from raw teams, queried via espn_player_id column, not player.id"
  - "writePlayerPeriodStats() accepts raw ESPN teams array (not normalized), extracts statSplitTypeId=5 for current period"

requirements-completed:
  - ACTIVE-01
  - ACTIVE-02
  - ACTIVE-03

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 75 Plan 01: Active Stats Backend Summary

**player_period_stats table created with daily snapshot population and roster API enriched with tenureStats (summed counting-stat components per player per team)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T19:01:00Z
- **Completed:** 2026-03-26T19:04:09Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments
- Created `player_period_stats` DB table (migration 006) with PK (league_id, scoring_period, player_id) and team_id for tenure filtering
- Added `writePlayerPeriodStats()` to snapshot orchestrator — extracts per-player stats from raw ESPN data on every daily snapshot, not just backfill
- Extended roster API to query `player_period_stats WHERE team_id=teamId` and return `tenureStats` as summed component sums per player

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable player_period_stats population during daily snapshot** - `03e3939` (feat)
2. **Task 2: Extend roster API to return tenure stats** - `50aa727` (feat)

**Plan metadata:** (to be added after docs commit)

## Files Created/Modified
- `packages/backend/src/db/migrations/006_add_player_period_stats.sql` - New table with league_id, scoring_period, player_id PK; team_id, lineup_slot_id, components_json columns
- `packages/backend/src/agents/snapshot-orchestrator.ts` - Added ESPN_PERIOD_STAT_MAP, writePlayerPeriodStats(), call site in executeSnapshot()
- `packages/backend/src/api/recommendations.ts` - Tenure stats query and aggregation, tenureStats in roster response
- `packages/backend/src/db/schema.ts` - Added player_period_stats to Database interface
- `packages/shared/src/types.ts` - Added PlayerPeriodStats interface

## Decisions Made
- Used `player.espn_player_id` (not `player.id`) for the ESPN-to-DB player ID lookup since `player.id` is a DB surrogate key
- Stored only counting stats in `components_json`; rate stats (AVG, ERA, WHIP) are computed at read time from components
- ESPN OUTS stat (stat ID 34) is converted to IP via /3 during ingest to align with formula expectations
- Tenure stats are raw component sums — frontend handles rate computation via existing `calculateAVG`, `calculateERA`, etc.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing player_period_stats table infrastructure**
- **Found during:** Task 1 (Enable player_period_stats population during daily snapshot)
- **Issue:** Plan referenced `player_period_stats` as if it already existed from "historical backfill", but neither the table, migration, TypeScript type, nor Database schema entry existed in the codebase
- **Fix:** Created migration 006, added PlayerPeriodStats interface to shared/src/types.ts, added to Database interface in schema.ts, built shared package to generate dist types
- **Files modified:** packages/backend/src/db/migrations/006_add_player_period_stats.sql, packages/shared/src/types.ts, packages/backend/src/db/schema.ts
- **Verification:** TypeScript compiles without errors after shared build
- **Committed in:** 03e3939 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed wrong join column name in roster endpoint**
- **Found during:** Task 2 (Extend roster API to return tenure stats)
- **Issue:** `player_projection` JOIN used `proj.run_id` but the column is `proj.projections_run_id` — this would cause a runtime SQL error
- **Fix:** Changed `proj.run_id` to `proj.projections_run_id` in the innerJoin call
- **Files modified:** packages/backend/src/api/recommendations.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 50aa727 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure missing, 1 bug)
**Impact on plan:** Both auto-fixes required for correct operation. No scope creep.

## Issues Encountered
- The plan's line number references (e.g., "line 344", "line 752", "rawData variable at line 114") did not match the actual file — the snapshot orchestrator was significantly shorter (499 lines) with no `writeCurrentStandingsFromPlayerStats` method, no backfill code, and the ESPN data was in `espnData.data` (not `rawData`). Adapted implementation to the actual codebase structure.

## User Setup Required
Database migration required: run migration 006 (`006_add_player_period_stats.sql`) against the PostgreSQL database before the next snapshot.

## Next Phase Readiness
- Backend foundation ready for Phase 75-02 (frontend display of tenure stats)
- `tenureStats` is available in `GET /api/leagues/:id/teams/:teamId/roster` response as a map of component keys to numeric values
- Frontend should use `PlayerStatLine` or similar component to display tenure stats with "On Team" label
- Rate stats (AVG, ERA, WHIP) must be computed from components using existing formula functions

---
*Phase: 75-active-stats*
*Completed: 2026-03-26*

---
phase: 74-cache-and-materialize-derived-data-from-previous-seasons-to-avoid-recalculating-immutable-historical-stats
plan: 01
subsystem: backend
tags: [caching, performance, database, migrations, projections]
dependency_graph:
  requires: []
  provides: [season-finalization-system]
  affects: [snapshot-orchestrator, historical-backfill, admin-api]
tech_stack:
  added: []
  patterns: [upsert-on-conflict, finalization-guard, generated-db-columns]
key_files:
  created:
    - packages/backend/src/db/migrations/020_add_season_metadata.sql
  modified:
    - packages/backend/src/db/schema.ts
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/agents/historical-backfill.ts
    - packages/backend/src/api/admin.ts
decisions:
  - "SeasonMetadata.created_at uses Generated<Date> to match DB DEFAULT NOW() — required for Kysely insert type safety"
  - "Finalization guard placed before step 7 computeProjectedStandings(), outside all forceFresh branches — independent guard"
  - "finalizeSeasonIfComplete uses INSERT...ON CONFLICT DO UPDATE for idempotent upsert across multiple backfill runs"
metrics:
  duration: 2 min
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 5
---

# Phase 74 Plan 01: Season Finalization Cache Summary

Season finalization system using `season_metadata` table with `is_finalized` boolean guard in snapshot orchestrator, auto-finalization in backfill agent on successful completion, and admin API to view/reset finalization per season.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add season_metadata table, schema type, finalization guard in orchestrator | 8eba353 | migration 020, schema.ts, snapshot-orchestrator.ts |
| 2 | Add auto-finalization in backfill agent and admin reset endpoint | e52b6eb | historical-backfill.ts, admin.ts, schema.ts (fix) |

## What Was Built

1. **Migration 020** (`020_add_season_metadata.sql`): Creates `season_metadata` table with `(league_id, season)` primary key, `is_finalized` boolean, `finalized_at` timestamp, `snapshot_count`, and `created_at`.

2. **Schema type** (`schema.ts`): `SeasonMetadata` interface with `Generated<Date>` for `created_at` (matches DB default), registered in `Database` interface under `season_metadata`.

3. **Finalization guard** (`snapshot-orchestrator.ts`): Inserts a `selectFrom("season_metadata")` check (step 6b) before `computeProjectedStandings()` (step 7). When `seasonMeta?.is_finalized` is true, logs a skip message and the `else if (projectionsRun)` block is bypassed entirely. This guard is independent of `forceFresh`.

4. **Auto-finalization** (`historical-backfill.ts`): After the backfill loop completes, if `weeksFailed < totalWeeks`, calls `finalizeSeasonIfComplete()` which upserts `season_metadata` with `is_finalized=true`. Idempotent — safe to call on repeat backfills.

5. **Admin endpoints** (`admin.ts`):
   - `PUT /api/admin/seasons/:leagueId/:season/finalize` — upserts `season_metadata` with `{ finalized: boolean }` body, supports toggling finalization on/off
   - `GET /api/admin/seasons/:leagueId` — lists all season metadata rows for a league ordered by season desc

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SeasonMetadata.created_at needed Generated<Date> not Date**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** TypeScript error: `created_at` is required in insert but shouldn't be — DB has `DEFAULT NOW()`
- **Fix:** Changed `created_at: Date` to `created_at: Generated<Date>` in `SeasonMetadata` interface, matching the pattern used by all other tables with generated defaults
- **Files modified:** `packages/backend/src/db/schema.ts`
- **Commit:** e52b6eb (included in same task commit)

## Known Stubs

None — all functionality is fully implemented.

## Self-Check: PASSED

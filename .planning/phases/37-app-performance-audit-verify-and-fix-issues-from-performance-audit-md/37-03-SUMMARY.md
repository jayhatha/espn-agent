---
phase: 37-app-performance-audit
plan: 03
subsystem: database
tags: [postgresql, kysely, indexes, pagination, api, timeseries]

# Dependency graph
requires:
  - phase: 37-02
    provides: batch query elimination (B-01, B-02, B-03)
provides:
  - Composite indexes on team_roster_snapshot and team_daily_category_totals (B-13)
  - Offset-based pagination on free-agent endpoint (B-08)
  - Default LIMIT 1000 on all timeseries endpoints (B-10)
  - LIMIT 100 on league list query (B-17)
affects: [37-04, 37-05, recommendations-api, timeseries-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [SQL migration with IF NOT EXISTS guards, offset-based pagination with total count in response]

key-files:
  created:
    - packages/backend/src/db/migrations/017_add_missing_indexes.sql
  modified:
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/api/timeseries.ts
    - packages/backend/src/api/leagues.ts

key-decisions:
  - "Used .sql migration format (not .ts Kysely migration) to match all 16 existing migrations"
  - "Pagination applied after sort (client-side slice) because ESPN free agent list comes from live API then enriched from DB"
  - "Default timeseries limit of 1000 rows is configurable via limit query param — not a hard cap"
  - "Applied LIMIT to all 4 timeseries endpoints (overall, category-rank, category-total, projected-overall) for consistency"

patterns-established:
  - "Pagination pattern: { freeAgents, snapshotDate, pagination: { limit, offset, total } }"
  - "Timeseries limit pattern: const queryLimit = limit ? parseInt(limit, 10) : 1000"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 37 Plan 03: Missing Indexes, Pagination, and Query Limits Summary

**SQL migration adding two composite indexes plus offset pagination on free-agent API and default 1000-row limits on all unbounded timeseries and league list queries (B-08, B-10, B-13, B-17)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T02:21:54Z
- **Completed:** 2026-03-10T02:23:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created migration 017 with two composite indexes: `idx_team_roster_snapshot_league_date_team` and `idx_team_daily_cat_totals_league_date_team` — prevents full table scans on the most heavily queried tables
- Added `offset` query param to free-agent endpoint with `pagination: { limit, offset, total }` metadata in response (B-08)
- Added `limit` param to `TimeSeriesQuery` interface and applied `queryLimit` (default 1000) to all 4 unbounded timeseries endpoints (B-10)
- Added `.limit(100)` to league list query in leagues.ts (B-17)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add missing composite indexes via SQL migration (B-13)** - `a47b94d` (chore)
2. **Task 2: Add pagination to free-agent endpoint and LIMIT to unbounded queries (B-08, B-10, B-17)** - `03ba4bd` (feat)

**Plan metadata:** see final commit below

## Files Created/Modified
- `packages/backend/src/db/migrations/017_add_missing_indexes.sql` - Two composite indexes for team_roster_snapshot and team_daily_category_totals
- `packages/backend/src/api/recommendations.ts` - Added offset param, pagination metadata to free-agent response
- `packages/backend/src/api/timeseries.ts` - Added limit to TimeSeriesQuery type, applied queryLimit (default 1000) to 4 timeseries endpoints
- `packages/backend/src/api/leagues.ts` - Added .limit(100) to league list query

## Decisions Made
- Used `.sql` format for migration 017 to match all 16 existing migrations (the plan suggested `.ts` but all migrations are `.sql`)
- Pagination on free-agent endpoint is applied after sorting (post-ESPN-fetch) since free agents come from live ESPN API, then enriched from DB — offsetting at the DB query level would require different architecture
- Timeseries limit defaults to 1000 but is user-configurable via `?limit=N` query param, keeping it flexible for clients needing more or fewer rows
- Applied limit to all 4 timeseries variants (overall, category-rank, category-total, projected-overall) for consistency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Format mismatch] Used .sql instead of .ts migration format**
- **Found during:** Task 1
- **Issue:** Plan specified `.ts` Kysely migration format but all 16 existing migrations are `.sql` files
- **Fix:** Created `017_add_missing_indexes.sql` using plain SQL matching existing convention
- **Files modified:** packages/backend/src/db/migrations/017_add_missing_indexes.sql
- **Verification:** File exists with both CREATE INDEX IF NOT EXISTS statements
- **Committed in:** a47b94d (Task 1 commit)

**2. [Rule 2 - Missing] Applied limit to category-total timeseries endpoint**
- **Found during:** Task 2
- **Issue:** Plan specified limits for overall and category-rank timeseries (lines 97 and 145) but category-total (line 199) and projected-overall (line 242) also had unbounded queries
- **Fix:** Applied queryLimit pattern to all 4 unbounded timeseries endpoints for consistency
- **Files modified:** packages/backend/src/api/timeseries.ts
- **Verification:** grep `.limit(` shows 4 matches in timeseries.ts
- **Committed in:** 03ba4bd (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 format correction, 1 scope extension for completeness)
**Impact on plan:** Both deviations improved on the plan. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `espn.ts` (`throttleEspnCall` naming issue) was present before our changes and confirmed out of scope. No TS errors in our modified files.

## User Setup Required
None - migration 017 will be applied automatically when the backend next runs migrations. No manual steps needed.

## Next Phase Readiness
- B-08, B-10, B-13, B-17 all resolved
- Migration 017 ready to execute against the database
- Timeseries endpoints now have consistent default limits
- Free-agent endpoint supports paginated access for large player pools

---
*Phase: 37-app-performance-audit*
*Completed: 2026-03-10*

## Self-Check: PASSED

All files verified present:
- packages/backend/src/db/migrations/017_add_missing_indexes.sql: FOUND
- packages/backend/src/api/recommendations.ts: FOUND
- packages/backend/src/api/timeseries.ts: FOUND
- packages/backend/src/api/leagues.ts: FOUND
- .planning/phases/37-app-performance-audit-.../37-03-SUMMARY.md: FOUND

All commits verified:
- a47b94d (Task 1 migration): FOUND
- 03ba4bd (Task 2 API changes): FOUND

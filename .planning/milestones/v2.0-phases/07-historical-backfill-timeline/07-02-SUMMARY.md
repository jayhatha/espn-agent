---
phase: 07-historical-backfill-timeline
plan: 02
subsystem: frontend-ui
tags: [backfill-ui, season-filter, admin-dashboard, trends-timeline]

dependency_graph:
  requires: [phase-07-plan-01, phase-05-admin]
  provides: [backfill-management-ui, season-filtered-timeseries]
  affects: [admin-page, trends-page, api-client]

tech_stack:
  added:
    - TanStack Query polling with dynamic refetchInterval
    - Season-based year filtering on timeseries queries
  patterns:
    - Progress bar UI with percentage and completed/total weeks
    - Status badge color mapping (active=blue, completed=green, failed=red, waiting=yellow)
    - Season selector dropdown with "Current Season" default option

key_files:
  created: []
  modified:
    - packages/frontend/src/lib/api.ts
    - packages/frontend/src/app/admin/page.tsx
    - packages/backend/src/api/timeseries.ts
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx

decisions:
  - title: "2-second polling for active backfill jobs"
    rationale: "Real-time progress feedback without overwhelming the server; stops polling when status is completed or failed"
    impact: "activeJobData query uses dynamic refetchInterval based on job status"

  - title: "Season filter additive to existing from/to filters"
    rationale: "Season narrows to year boundaries, then from/to can further refine within that year"
    impact: "Season filter applied first (WHERE snapshot_date >= '2024-01-01' AND <= '2024-12-31'), then from/to filters applied if present"

  - title: "10-second polling for recent backfill jobs table"
    rationale: "Background refresh keeps table updated without user action, slower than active job polling"
    impact: "backfillJobsData query uses refetchInterval: 10000"

metrics:
  duration: 4min
  completed_date: 2026-02-21
  tasks_completed: 2
  files_created: 0
  files_modified: 4
  commits: 2
---

# Phase 07 Plan 02: Frontend Backfill UI and Season Timeline Summary

**One-liner:** Admin backfill trigger form with real-time progress polling and season-filtered trends page for historical timeline viewing

## Completed Tasks

| Task | Name                                                      | Commit  | Files                                                    |
| ---- | --------------------------------------------------------- | ------- | -------------------------------------------------------- |
| 1    | Admin backfill UI with trigger form and progress polling | a057c59 | api.ts, admin/page.tsx                                   |
| 2    | Season filter on timeseries + season selector on trends  | 35d6e8e | timeseries.ts, api.ts, trends/page.tsx                   |

## What Was Built

### Admin Backfill UI

**API Client Methods** (`packages/frontend/src/lib/api.ts`):
- `triggerBackfill(leagueId, { season, startWeek, endWeek })` - POST to /api/admin/leagues/:leagueId/backfill
- `getBackfillJobStatus(jobId)` - GET job status with progress
- `getBackfillJobs()` - GET recent backfill jobs list

**Admin Page Backfill Section** (`packages/frontend/src/app/admin/page.tsx`):
- **Trigger Form:** League dropdown (from existing leaguesData), season input (default current year - 1, min 2017, max current year), start/end week inputs (1-26 range), validation (startWeek <= endWeek), submit button
- **Active Job Progress:** Only shown when activeJobId is set, polls every 2 seconds while status is "active" or "waiting", displays progress bar (percentage width), stage text, "X of Y weeks completed", green success message on completion, red error message on failure
- **Recent Jobs Table:** Polls every 10 seconds, displays Job ID (truncated), League ID, Season, Status badge (blue/green/red/yellow), Progress percentage, Created timestamp
- **State Management:** useState for selectedLeagueId, season, startWeek, endWeek, activeJobId, backfillError, backfillSuccess
- **Mutations:** backfillMutation sets activeJobId on success, invalidates backfill-jobs query

**Progress Polling:**
```typescript
refetchInterval: (query) => {
  const status = query.state.data?.status;
  return status === "completed" || status === "failed" ? false : 2000;
},
```

### Season-Filtered Timeseries

**Backend Timeseries Routes** (`packages/backend/src/api/timeseries.ts`):
- Updated `TimeSeriesQuery` interface to include `season?: string`
- Added season filtering to three endpoints:
  - `/api/leagues/:leagueId/timeseries/overall`
  - `/api/leagues/:leagueId/timeseries/category-rank`
  - `/api/leagues/:leagueId/timeseries/projected-overall`
- Season filter logic (applied before from/to):
  ```typescript
  if (season) {
    const seasonYear = parseInt(season, 10);
    query = query
      .where("snapshot_date", ">=", `${seasonYear}-01-01`)
      .where("snapshot_date", "<=", `${seasonYear}-12-31`);
  }
  ```
- **New Endpoint:** `GET /api/leagues/:leagueId/seasons`
  - Returns `{ seasons: [2025, 2024, 2023, ...] }` array of year numbers
  - Query: `SELECT DISTINCT EXTRACT(YEAR FROM snapshot_date::date)::integer AS season`
  - Ordered by season DESC (newest first)

**Frontend API Client** (`packages/frontend/src/lib/api.ts`):
- Updated `getOverallTimeSeries`, `getCategoryRankTimeSeries`, `getProjectedOverallTimeSeries` params to include `season?: string`
- Added `getLeagueSeasons(leagueId)` method

**Trends Page Season Selector** (`packages/frontend/src/app/leagues/[id]/trends/page.tsx`):
- Added `selectedSeason` state (default: undefined)
- Added `seasonsData` query: `useQuery({ queryKey: ["league-seasons", leagueId], queryFn: () => api.getLeagueSeasons(...) })`
- Season selector dropdown positioned next to view mode tabs (right side of header)
- Options: "Current Season" (value="", sets undefined) + dynamically loaded seasons from API
- Updated all three timeseries queries:
  - Added `selectedSeason` to queryKey arrays
  - Pass `{ season: selectedSeason }` to API calls
  - Queries refetch automatically when selectedSeason changes

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**API Methods Verified:**
```bash
grep -n "triggerBackfill\|getBackfillJobStatus\|getBackfillJobs" packages/frontend/src/lib/api.ts
```
All three methods exist at lines 317, 324, 328.

**Admin Page Backfill UI Verified:**
```bash
grep -n "backfill\|Backfill\|Historical" packages/frontend/src/app/admin/page.tsx | head -20
```
"Historical Backfill" section present with state, queries, mutation, and form handlers.

**Season Parameter Verified:**
```bash
grep -n "season" packages/backend/src/api/timeseries.ts | head -15
```
Season filtering logic present in all three timeseries endpoints (lines 76-80, 127-131, 160-164).

**Seasons Endpoint Verified:**
```bash
grep -n "seasons" packages/backend/src/api/timeseries.ts
```
GET /api/leagues/:leagueId/seasons endpoint exists at line 23.

**Season Selector Verified:**
```bash
grep -n "selectedSeason\|getLeagueSeasons" packages/frontend/src/app/leagues/[id]/trends/page.tsx
```
State variable, query, and dropdown all present. Season passed to all three timeseries queries.

## Self-Check: PASSED

**Modified files verified:**
```bash
[ -f "packages/frontend/src/lib/api.ts" ] && echo "FOUND: api.ts"
[ -f "packages/frontend/src/app/admin/page.tsx" ] && echo "FOUND: admin/page.tsx"
[ -f "packages/backend/src/api/timeseries.ts" ] && echo "FOUND: timeseries.ts"
[ -f "packages/frontend/src/app/leagues/[id]/trends/page.tsx" ] && echo "FOUND: trends/page.tsx"
```
All files found.

**Commits verified:**
```bash
git log --oneline | grep -E "a057c59|35d6e8e"
```
Both commits present in git history:
- a057c59: feat(07-02): add admin backfill UI with trigger form and progress polling
- 35d6e8e: feat(07-02): add season filter to timeseries and season selector to trends page

## Notes

**Admin Page Integration:**
- Backfill section positioned after "League Health" section
- Follows existing admin page styling patterns (white shadow cards, Tailwind-only)
- League dropdown populated from existing `leaguesData` query
- Success/error messages use existing pattern (green/red bordered divs)

**Season Filter Behavior:**
- "Current Season" option (empty string → undefined) preserves existing unfiltered behavior
- Season filter is additive: narrows to year boundaries, then from/to can refine further
- Backend validates season as integer, constructs date range `YYYY-01-01` to `YYYY-12-31`
- Frontend passes season as string, backend parses to integer

**Progress Tracking UI:**
- Active job section only visible when `activeJobId` is set (user just triggered a backfill)
- Progress bar uses Tailwind width percentage: `style={{ width: \`\${percentage}%\` }}`
- Status badges use consistent color scheme across admin page (active=blue, completed=green, failed=red, waiting=yellow)
- Job ID truncated in table for readability (first 20 chars + "...")

**Next Steps:**
- Users can now trigger backfills from admin page and monitor progress in real-time
- Users can view historical season data on trends page by selecting a season
- Integration test recommended: trigger backfill → verify progress updates → select season on trends page → confirm filtered data

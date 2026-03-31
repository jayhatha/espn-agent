---
phase: 80-standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots
plan: "02"
subsystem: api-wiring
tags: [fastify, api, frontend-client, standings-swing]
dependency_graph:
  requires: [80-01]
  provides: [GET /api/leagues/:leagueId/standings/swing, api.getStandingsSwing]
  affects: [packages/backend/src/api/timeseries.ts, packages/frontend/src/lib/api.ts]
tech_stack:
  added: []
  patterns: [fastify-route, frontend-api-client]
key_files:
  created: []
  modified:
    - packages/backend/src/api/timeseries.ts
    - packages/frontend/src/lib/api.ts
    - packages/backend/src/agents/standings-swing-attribution.ts
    - packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts
decisions:
  - "snapshotDate auto-resolved to latest snapshot when omitted — consistent with existing /standings/projected pattern"
  - "teamId passed as query param (not path) matching plan spec — optional snapshotDate also in querystring"
metrics:
  duration: "6 min"
  completed: "2026-03-31"
  tasks_completed: 2
  files_modified: 4
---

# Phase 80 Plan 02: API Wiring — GET /standings/swing + api.getStandingsSwing() Summary

Wire StandingsSwingAttributionAgent into a Fastify route and expose a typed method in the frontend API client — pure wiring, no new tables or libraries.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add GET /standings/swing route to timeseries.ts | ebfc840 | timeseries.ts, standings-swing-attribution.ts, test |
| 2 | Add api.getStandingsSwing() to frontend API client | 48c766c | api.ts |

## What Was Built

**Backend route** (`packages/backend/src/api/timeseries.ts`):
- `GET /api/leagues/:leagueId/standings/swing?teamId=X&snapshotDate=YYYY-MM-DD`
- Returns 400 when `teamId` is missing or non-numeric
- Returns 404 when no snapshots exist for the league
- Auto-resolves `snapshotDate` to latest snapshot when omitted
- Delegates computation to `StandingsSwingAttributionAgent.computeSwing()`
- Follows existing auth pattern: `authenticate` + `requireLeagueAccess`

**Frontend client method** (`packages/frontend/src/lib/api.ts`):
- `api.getStandingsSwing(leagueId, teamId, params?)` added after `getProjectedStandings`
- Passes `teamId` via `cleanParams` helper to handle type coercion
- Fetches from `/api/leagues/${leagueId}/standings/swing?${query}`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `espn_player_id` column does not exist on `player` table**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** `computeTopProjectionDrivers` queried `player` table with `.select(["espn_player_id", "name"])` and `.where("espn_player_id", "in", playerIds)`. The column was removed by migration 016 (merged into `id`).
- **Fix:** Changed to `.select(["id", "name"])` and `.where("id", "in", playerIds)`. Updated `nameMap` construction to use `p.id`.
- **Files modified:** `packages/backend/src/agents/standings-swing-attribution.ts`
- **Commit:** ebfc840

**2. [Rule 1 - Bug] `projected_roto_points` is `number | null` but typed as `number` in agent**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** `buildCategoryMap` and `computeTopCompetitorMover` method signatures required `number` but the Kysely query returns `number | null` per the `TeamDailyProjectedCategory` interface.
- **Fix:** Updated both method signatures to accept `number | null`; added `?? 0` coalesce in `buildCategoryMap` when storing the value.
- **Files modified:** `packages/backend/src/agents/standings-swing-attribution.ts`
- **Commit:** ebfc840

**3. [Rule 1 - Bug] Category `display_name` field does not exist — should be `name`**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** The categories cast used `display_name: string` but the `Category` interface in `packages/shared/src/types.ts` uses `name: string`. Both the cast type and `cat.display_name` usage in `categoryBreakdown.push` were wrong.
- **Fix:** Updated cast type to use `name: string`; changed `cat.display_name` → `cat.name`.
- **Files modified:** `packages/backend/src/agents/standings-swing-attribution.ts`
- **Commit:** ebfc840

**4. [Rule 1 - Bug] Unused `leagueId` parameter in `computeTopProjectionDrivers`**
- **Found during:** Task 1 (TypeScript build, `error TS6133`)
- **Issue:** `computeTopProjectionDrivers` declared `leagueId: number` as first parameter but never used it.
- **Fix:** Removed `leagueId` from method signature and call site.
- **Files modified:** `packages/backend/src/agents/standings-swing-attribution.ts`
- **Commit:** ebfc840

**5. [Rule 1 - Bug] Unused `CategoryAttribution` type import in test file**
- **Found during:** Task 1 (TypeScript build, `error TS6133`)
- **Issue:** `standings-swing-attribution.test.ts` imported `type CategoryAttribution` but never referenced it.
- **Fix:** Removed unused import.
- **Files modified:** `packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts`
- **Commit:** ebfc840

All 5 bugs were pre-existing in the agent created in Plan 01, surfaced when TypeScript compiled the new route import.

## Known Stubs

None — this plan is pure wiring. The agent returns real computed values from the database.

## Self-Check: PASSED

- timeseries.ts exists: FOUND
- api.ts exists: FOUND
- Commit ebfc840 (Task 1): FOUND
- Commit 48c766c (Task 2): FOUND

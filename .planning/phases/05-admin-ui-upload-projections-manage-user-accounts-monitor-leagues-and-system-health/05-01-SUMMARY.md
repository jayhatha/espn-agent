---
phase: 05-admin-ui
plan: 01
subsystem: backend-api
tags:
  - admin
  - api
  - user-management
  - system-health
  - projections
dependency_graph:
  requires:
    - auth-middleware
    - db-schema
  provides:
    - admin-user-api
    - admin-stats-api
    - admin-leagues-api
    - batch-projections-upload
  affects:
    - admin-ui
tech_stack:
  added:
    - none
  patterns:
    - admin-only-endpoints
    - batch-file-upload
    - re-snapshot-helper-extraction
key_files:
  created:
    - packages/backend/src/api/admin.ts
  modified:
    - packages/backend/src/index.ts
    - packages/backend/src/api/projections.ts
decisions:
  - Extract re-snapshot logic into helper function to avoid duplication between single and batch upload endpoints
  - Use any types for Fastify handlers to avoid generic type incompatibility issues (consistent with existing codebase patterns)
  - Auto-detect batter vs pitcher files by field name first, then fall back to header inspection
metrics:
  duration: 5min
  completed: 2026-02-20
---

# Phase 05 Plan 01: Admin API Backend Summary

**Admin API endpoints for user management, system statistics, league health monitoring, and batch projections upload.**

## What Was Built

Created backend admin API routes providing data endpoints for the admin dashboard frontend:

### Admin Routes (`packages/backend/src/api/admin.ts`)

1. **GET /api/admin/users** - Paginated user list
   - Query params: page (default 1), limit (default 50)
   - Returns: id, email, role, display_name, created_at, last_login_at, oauth_provider
   - Sorted by created_at desc
   - Includes total count for pagination

2. **PATCH /api/admin/users/:userId/role** - Role management
   - Body: `{ role: "user" | "admin" }`
   - Validates role is one of ["user", "admin"]
   - Prevents admin from demoting themselves
   - Logs role changes with adminId, targetUserId, newRole
   - Returns: `{ success: true, userId, role }`

3. **GET /api/admin/stats** - System overview
   - User count
   - League count
   - Latest projection run (id, as_of_date, staleness, ingested_at)
   - Snapshot stats for last 7 days: total, healthy, degraded, successRate percentage

4. **GET /api/admin/leagues** - League health summary
   - Uses CTE to get latest snapshot per league
   - Returns: id, name, espnLeagueId, snapshotDate, isDegraded, degradedReasons, status
   - Status derived as: no_snapshot | degraded | healthy

All endpoints protected with `requireAdmin` middleware and rate-limited (60 requests/minute).

### Batch Projections Upload (`packages/backend/src/api/projections.ts`)

5. **POST /api/projections/upload-batch** - Multi-file upload
   - Accepts multiple files (batter + pitcher) in one request
   - Auto-detects file type by field name ("batter"/"pitcher") or header inspection
   - Calls ProjectionsIngestAgent.ingest() with both CSV strings
   - Triggers degraded league re-snapshots
   - Returns: `{ projectionsRunId, batters: report, pitchers: report }`
   - Rate limit: 10 requests/hour
   - Admin-only (same auth pattern as existing upload endpoint)

### Code Quality Improvements

- Extracted re-snapshot logic from `/upload` endpoint into `triggerDegradedLeagueResnapshots()` helper function
- Both `/upload` and `/upload-batch` now share the same re-snapshot logic (99 lines → 1 function call)
- Eliminates code duplication and ensures consistent behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript generic type incompatibility in route handlers**
- **Found during:** Task 1 (admin.ts compilation)
- **Issue:** Fastify generic type `FastifyRequest<{ Querystring: ... }>` caused type errors with route handler signature
- **Fix:** Used `any` types for handlers (consistent with existing codebase pattern in leagues.ts, projections.ts)
- **Files modified:** packages/backend/src/api/admin.ts, packages/backend/src/api/projections.ts
- **Commit:** e16f3cc, 2a27d99

**2. [Rule 1 - Bug] Unused parameters and imports causing TS errors**
- **Found during:** Task 1 (admin.ts compilation)
- **Issue:** Unused `reply` parameters and unused type imports triggering TS6133/TS6196 errors
- **Fix:** Removed unused parameters and imports
- **Files modified:** packages/backend/src/api/admin.ts
- **Commit:** e16f3cc

**3. [Rule 1 - Bug] Implicit 'any' type in map callback**
- **Found during:** Task 2 (projections.ts compilation)
- **Issue:** `league` parameter in `degradedLeagues.map()` had implicit any type
- **Fix:** Added explicit `any` type annotation
- **Files modified:** packages/backend/src/api/projections.ts
- **Commit:** 2a27d99

## Verification Results

1. **TypeScript compilation:** ✓ PASSED - No errors in admin.ts or projections.ts
2. **admin.ts exports adminRoutes:** ✓ PASSED - Function exported and registered in index.ts
3. **All 4 admin endpoints use requireAdmin:** ✓ PASSED - All routes have `onRequest: [requireAdmin]`
4. **upload-batch handles multiple files:** ✓ PASSED - Uses async iterator over `request.files()`
5. **No code duplication in re-snapshot logic:** ✓ PASSED - Extracted into `triggerDegradedLeagueResnapshots()` helper

## Files Changed

### Created
- `packages/backend/src/api/admin.ts` (263 lines) - Admin API routes module

### Modified
- `packages/backend/src/index.ts` (+2 lines) - Import and register adminRoutes
- `packages/backend/src/api/projections.ts` (+99 insertions, -81 deletions) - Add batch upload endpoint, extract helper function

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1    | e16f3cc | feat(05-01): create admin API routes (users, stats, leagues) |
| 2    | 2a27d99 | feat(05-01): add batch projections upload endpoint |

## Success Criteria

- [x] Backend compiles with zero TypeScript errors in new files
- [x] admin.ts has 4 endpoints: GET /api/admin/users, PATCH /api/admin/users/:userId/role, GET /api/admin/stats, GET /api/admin/leagues
- [x] projections.ts has new POST /api/projections/upload-batch endpoint
- [x] All admin endpoints protected with requireAdmin
- [x] Re-snapshot logic extracted into shared helper function
- [x] Batch upload auto-detects batter vs pitcher files
- [x] adminRoutes registered in index.ts

## Next Steps

Phase 05 Plan 02: Build admin UI frontend (React dashboard consuming these endpoints)

---

## Self-Check: PASSED

**Created files verification:**
- packages/backend/src/api/admin.ts: FOUND ✓

**Modified files verification:**
- packages/backend/src/index.ts: FOUND ✓
- packages/backend/src/api/projections.ts: FOUND ✓

**Commits verification:**
- e16f3cc: FOUND ✓
- 2a27d99: FOUND ✓

All claimed files and commits exist.

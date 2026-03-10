---
phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md
plan: 01
subsystem: infra
tags: [bullmq, kysely, postgres, lru-cache, tanstack-query, react]

# Dependency graph
requires: []
provides:
  - DB connection pool sized for concurrency (max 25, timeouts, maxUses)
  - BullMQ snapshot worker with concurrency: 3
  - Parallel team projection computation via Promise.all
  - Snapshot orchestrator reuses espnTeamIdToDbId map without re-querying
  - DLQ retention reduced from 30 to 7 days
  - ESPN LRU cache holds 2000 entries
  - Standings page memoized matrix builders
  - TanStack Query staleTime 5min, gcTime 10min
affects: [snapshot-orchestrator, standings-projection, espn-adapter, frontend-standings, providers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Declare shared state before transaction so it survives transaction scope"
    - "Use Promise.all for independent async operations instead of sequential loop"
    - "useMemo for expensive derived state from query data"

key-files:
  created: []
  modified:
    - packages/backend/src/db/connection.ts
    - packages/backend/src/workers/snapshot-worker.ts
    - packages/backend/src/agents/standings-projection.ts
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/adapters/espn.ts
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/app/providers.tsx

key-decisions:
  - "Pool max set to 25 to support Promise.all parallelism (12 teams * 4 queries each + overhead)"
  - "DLQ retention 7 days is sufficient for post-incident analysis — 30 days was over-provisioned"
  - "espnTeamIdToDbId declared before transaction block so it can be reused at step 8 without per-team re-queries"

patterns-established:
  - "useMemo pattern for matrix builders: wrap expensive Map builds in useMemo([data]) in standings pages"
  - "Worker concurrency pattern: always set concurrency option on BullMQ Worker constructor"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 37 Plan 01: App Performance Audit Quick Wins Summary

**8 performance issues resolved across DB pool, worker concurrency, parallel projections, team map reuse, DLQ retention, LRU cache size, standings memoization, and query cache settings**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:08:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Backend: pool max 25 with timeouts + maxUses, worker concurrency 3, Promise.all for team projections, eliminated per-team DB re-queries at step 8, DLQ 7d, LRU 2000
- Frontend: standings matrices memoized via useMemo to prevent recompute on every render
- Frontend: TanStack Query staleTime 5min + gcTime 10min reduces unnecessary refetches

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend quick wins** - `94d5dd3` (perf)
2. **Task 2: Frontend quick wins** - `3a0d059` (perf)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/backend/src/db/connection.ts` - Pool max 25, connectionTimeoutMillis 5000, idleTimeoutMillis 30000, maxUses 7500
- `packages/backend/src/workers/snapshot-worker.ts` - Worker concurrency 3, DLQ retention 7 days
- `packages/backend/src/agents/standings-projection.ts` - Sequential for loop replaced with Promise.all
- `packages/backend/src/agents/snapshot-orchestrator.ts` - espnTeamIdToDbId declared before transaction, step 8 reuses map directly
- `packages/backend/src/adapters/espn.ts` - LRU cache max increased from 500 to 2000
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - buildCurrentMatrix and buildProjectedMatrix wrapped in useMemo
- `packages/frontend/src/app/providers.tsx` - staleTime 5 * 60_000, gcTime 10 * 60_000

## Decisions Made

- Pool max 25 was sized to support Promise.all parallelism: 12 teams each issuing ~4 concurrent queries needs 48 connections in worst case, 25 covers typical 6-10 team leagues comfortably
- espnTeamIdToDbId scope change: moved declaration before `db.transaction().execute()` block so the Map survives the transaction callback closure and can be referenced at step 8 without rebuilding
- DLQ 7 days vs 30: 7 days is operationally sufficient for incident analysis; 30 days was unnecessary storage overhead

## Deviations from Plan

None - plan executed exactly as written.

Pre-existing TypeScript error in `snapshot-orchestrator.ts` line 548 (`roster_status: string` not assignable to `RosterStatus` enum) was in HEAD before this plan — logged to deferred items, out of scope.

## Issues Encountered

- Pre-existing TS error in snapshot-orchestrator.ts (`RosterStatus` import used in type annotation but `roster_status: entry.rosterStatus` is `string`) — confirmed this existed in HEAD before any changes. Not caused by B-04 edit. Not fixed (out of scope per SCOPE BOUNDARY rule).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 8 quick-win issues (B-04, B-05, B-06, B-07, B-16, F-01, F-02, I-04, I-05) resolved
- Pool is now sized correctly to support Promise.all parallelism in standings-projection
- Ready for remaining performance audit phases (B-01, B-02, B-03, F-03, etc.)

---
*Phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md*
*Completed: 2026-03-09*

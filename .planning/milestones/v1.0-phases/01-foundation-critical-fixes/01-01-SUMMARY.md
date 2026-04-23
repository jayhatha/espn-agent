---
phase: 01-foundation-critical-fixes
plan: 01
subsystem: infra
tags: [axios-retry, fastify-rate-limit, bullmq, redis, retry-logic, deduplication]

# Dependency graph
requires:
  - phase: 00-research
    provides: Identified critical infrastructure gaps (no retry, no rate limiting, no job dedup)
provides:
  - ESPN API retry with exponential backoff (3 retries, 1s/2s/4s)
  - API rate limiting with Redis-backed storage (per-route limits)
  - Snapshot job deduplication via BullMQ (league+date job IDs, 24h TTL)
affects: [data-sync, api-security, snapshot-pipeline]

# Tech tracking
tech-stack:
  added: [axios-retry, @fastify/rate-limit]
  patterns: [retryable axios factory, per-route rate limits, BullMQ job deduplication]

key-files:
  created:
    - packages/backend/src/utils/retry.ts
  modified:
    - packages/backend/src/adapters/espn.ts
    - packages/backend/src/index.ts
    - packages/backend/src/workers/snapshot-worker.ts
    - packages/backend/src/api/leagues.ts
    - packages/backend/src/api/projections.ts
    - packages/backend/src/api/timeseries.ts
    - packages/backend/src/api/recommendations.ts

key-decisions:
  - "Use axios-retry with exponential backoff instead of custom retry logic"
  - "Redis-backed rate limiting with in-memory fallback for dev environments"
  - "BullMQ removeOnComplete/removeOnFail for deduplication instead of custom locking"

patterns-established:
  - "Retryable axios: createRetryableAxios(logger) factory pattern for all HTTP clients"
  - "Rate limiting: per-route config in route options object with config.rateLimit"
  - "Job deduplication: jobId with removeOnComplete/removeOnFail TTL pattern"

requirements-completed: [DATA-05, INFR-02, INFR-03]

# Metrics
duration: 11min
completed: 2026-02-19
---

# Phase 01 Plan 01: Backend Infrastructure Summary

**ESPN API retry with exponential backoff (3 attempts, network/5xx errors), Redis-backed rate limiting (100/min reads, 30/min writes, 10/hr expensive ops), and BullMQ snapshot job deduplication (24h TTL)**

## Performance

- **Duration:** 11 minutes
- **Started:** 2026-02-19T21:42:55Z
- **Completed:** 2026-02-19T21:54:15Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- ESPN adapter automatically retries failed requests up to 3 times with exponential backoff (1s, 2s, 4s with jitter)
- API routes enforce per-route rate limits using Redis storage (in-memory fallback)
- Concurrent snapshot jobs for same league+date are deduplicated via BullMQ job IDs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add axios-retry and @fastify/rate-limit, create retryable axios utility, wire into ESPN adapter** - `d79504d` (feat)
2. **Task 2: Register rate limiting plugin and configure per-route limits** - `859967f` (feat)
3. **Task 3: Add BullMQ job deduplication for snapshot jobs** - `386cb9f` (feat)

## Files Created/Modified
- `packages/backend/src/utils/retry.ts` - Retryable axios factory with exponential backoff and retry logging
- `packages/backend/src/adapters/espn.ts` - Uses retryable axios for all ESPN API calls
- `packages/backend/src/index.ts` - Registers rate limit plugin with Redis backend
- `packages/backend/src/api/leagues.ts` - Rate limits on connect (30/min), snapshot trigger (10/hr), get endpoints (100/min)
- `packages/backend/src/api/projections.ts` - Rate limits on upload (10/hr), get endpoints (100/min)
- `packages/backend/src/api/timeseries.ts` - Rate limits on timeseries endpoints (100/min)
- `packages/backend/src/api/recommendations.ts` - Rate limits on evaluate endpoint (30/min)
- `packages/backend/src/workers/snapshot-worker.ts` - BullMQ deduplication with removeOnComplete/removeOnFail (24h TTL), updated retry delay to 5s base

## Decisions Made
- **axios-retry over custom retry:** Leveraged battle-tested library with exponential backoff and network error detection
- **Redis-backed rate limiting with in-memory fallback:** Allows production Redis storage while supporting local dev without Redis
- **BullMQ deduplication via removeOnComplete/removeOnFail:** Simpler than custom locking, built-in TTL cleanup
- **Per-route rate limits instead of global:** Allows expensive operations (snapshot, upload) to have stricter limits than reads
- **5s base retry delay (was 60s):** Faster recovery from transient failures (5s, 10s, 20s vs 1m, 2m, 4m)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All TypeScript errors encountered during verification were pre-existing in the codebase (auth middleware, crypto imports, Set iteration), not introduced by these changes. The modified files compile correctly in isolation.

## User Setup Required

None - no external service configuration required beyond existing Redis setup (already in env).

## Next Phase Readiness
- Infrastructure reliability improved: ESPN API calls are resilient to transient failures
- API protected from abuse: rate limiting prevents DoS and runaway requests
- Snapshot pipeline deduplicated: concurrent triggers won't create duplicate snapshots
- Ready for data quality and security fixes in subsequent plans

## Self-Check: PASSED

**Created files verified:**
- FOUND: packages/backend/src/utils/retry.ts

**Commits verified:**
- d79504d: feat(01-01): add ESPN API retry with exponential backoff
- 859967f: feat(01-01): add API rate limiting with Redis-backed storage
- 386cb9f: feat(01-01): add BullMQ job deduplication for snapshot jobs

All claimed artifacts exist on disk and in git history.

---
*Phase: 01-foundation-critical-fixes*
*Completed: 2026-02-19*

---
phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md
plan: 04
subsystem: api
tags: [espn, throttle, rate-limit, p-limit, axios, concurrency]

# Dependency graph
requires:
  - phase: 37-01
    provides: Performance audit identifying B-11 (throttle race condition) and B-12 (redundant 429 handling)
provides:
  - Thread-safe ESPN API throttling via p-limit single-concurrency queue
  - Simplified error handling delegating 429 retries to createRetryableAxios
affects: [espn-adapter, api-calls, rate-limiting]

# Tech tracking
tech-stack:
  added: [p-limit@7.3.0]
  patterns:
    - Module-level pLimit(1) mutex serializing all outbound ESPN API calls
    - throttledEspnCall<T> wrapper that enforces 2s spacing within the mutex

key-files:
  created: []
  modified:
    - packages/backend/src/adapters/espn.ts
    - packages/backend/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used p-limit(1) instead of a manual Promise-based mutex for cleaner serialization semantics"
  - "Kept lastEspnCall timestamp inside the p-limit queue so only one caller reads/writes it at a time"
  - "Delegated 429 retry handling entirely to createRetryableAxios (axios-retry with Retry-After header support)"

patterns-established:
  - "throttledEspnCall<T>: wraps any ESPN API call in the p-limit queue with 2s inter-call delay"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-10
---

# Phase 37 Plan 04: ESPN Adapter Throttle Race Condition and Redundant 429 Handling Summary

**Thread-safe ESPN API throttling via p-limit(1) mutex replacing racy module-level timestamp, with redundant 429 catch blocks removed in favor of createRetryableAxios**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-10T02:22:11Z
- **Completed:** 2026-03-10T02:30:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Installed p-limit@7.3.0 and wired it into ESPN adapter
- Replaced racy module-level `throttleEspnCall` function with `throttledEspnCall<T>` wrapper backed by `pLimit(1)` queue
- Updated all 5 ESPN API call sites (fetchLeague, fetchFreeAgents, fetchTransactions, fetchPreDraftAuctionValues inner loop, fetchGlobalDraftData inner loop) to use the new wrapper
- Removed 4 redundant `try/catch` blocks that re-caught 429 errors after axios-retry had already exhausted its retries

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace module-level throttle with p-limit mutex and clean up redundant 429 handling** - `421d211` (fix)

## Files Created/Modified
- `packages/backend/src/adapters/espn.ts` - Added pLimit import, replaced throttleEspnCall with throttledEspnCall<T>, updated 5 call sites, removed 4 redundant 429 catch blocks
- `packages/backend/package.json` - Added p-limit@^7.3.0 dependency
- `pnpm-lock.yaml` - Updated lockfile with p-limit install

## Decisions Made
- Used p-limit(1) instead of a custom Promise-based mutex — p-limit provides clean semantics for single-concurrency queuing with minimal boilerplate
- Kept the `lastEspnCall` timestamp inside the queue callback so only one caller reads and updates it at a time, eliminating the TOCTOU race
- Removed redundant 429 catch blocks in all methods that used `throttleEspnCall`; the `fetchHistoricalWeek` method was left as-is since it has its own instance-level throttle separate from the module-level one and was not in scope for this plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ESPN API throttling is now race-condition free; concurrent callers queue behind p-limit(1) and each waits their 2-second interval
- 429 error handling is clean: axios-retry handles retries with exponential backoff and Retry-After header parsing, errors propagate naturally after retries exhausted

---
*Phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md*
*Completed: 2026-03-10*

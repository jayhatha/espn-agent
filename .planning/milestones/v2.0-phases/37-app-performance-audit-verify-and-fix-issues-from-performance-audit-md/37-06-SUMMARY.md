---
phase: 37-app-performance-audit
plan: 06
subsystem: infra
tags: [turbo, next.js, typescript, formulas, pagination, postgresql]

# Dependency graph
requires:
  - phase: 37-02
    provides: Batch query elimination context (the remaining fixes in this plan build on the DB optimization work)
provides:
  - Turbo cache now invalidates when tsconfig files change
  - Next.js production bundle compression and no source maps
  - Single-pass O(n) SGP variance calculation
  - JSONB-free batter/pitcher detection in projections ingest
  - Client-side pagination for waivers recommendations list
affects: [build-pipeline, projections-ingest, waivers-page, formulas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-pass variance (Welford-style sumSq) instead of two-pass map+reduce
    - Application-level data classification instead of JSONB SQL aggregation
    - Client-side pagination via IIFE slice pattern in React

key-files:
  created: []
  modified:
    - turbo.json
    - packages/frontend/next.config.mjs
    - packages/shared/src/formulas.ts
    - packages/backend/src/agents/projections-ingest.ts
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx

key-decisions:
  - "Use sumSq single-pass formula (sumSq/n - mean^2) instead of two-pass map+reduce for SGP variance - eliminates intermediate squaredDiffs array allocation"
  - "Move batter/pitcher classification from JSONB SQL aggregation to application code - SELECT rows and classify with parseFloat in TypeScript loop"
  - "Waivers pagination uses IIFE pattern ((() => {...})()) to keep slice/totalPages computation close to render without extracting to separate component"

patterns-established:
  - "Single-pass variance: let sum=0, sumSq=0; for val: sum+=val, sumSq+=val*val; variance = sumSq/n - mean*mean"
  - "Classify projected rows in app code: SELECT stat_components_json, loop with parseFloat, avoid SQL JSONB inline casts"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 37 Plan 06: Infrastructure and Frontend Optimization Summary

**Turbo tsconfig cache invalidation, Next.js compression/no source maps, single-pass SGP formula, JSONB-free projections detection, and 10-per-page waivers pagination (I-02, I-03, B-14, B-15, F-03)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T00:08:39Z
- **Completed:** 2026-03-09T00:11:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Turbo cache now invalidates when any `tsconfig*.json` file changes (`globalDependencies`) and build task has explicit `inputs` array
- Next.js production bundle enables gzip compression and disables source map generation (smaller deploys)
- `calculateCategorySGP` in `formulas.ts` replaced two-pass variance (`.map()` + `.reduce()`) with single-pass `sumSq` algorithm — O(n) single loop, no intermediate array
- `projections-ingest.ts` batter/pitcher detection moved from JSONB inline casts in SQL to a simple TypeScript loop over fetched rows — eliminates PostgreSQL parsing every row's JSON blob
- Waivers page recommendations list paginated at 10 per page with Previous/Next controls and global rank numbers that account for page offset

## Task Commits

Each task was committed atomically:

1. **Task 1: Turbo cache config, Next.js production optimizations, single-pass SGP formula (I-02, I-03, B-14)** - `4f7d260` (feat)
2. **Task 2: Move JSONB batter/pitcher detection to application code and add waivers pagination (B-15, F-03)** - `8b8131c` (feat)

## Files Created/Modified

- `turbo.json` - Added `**/tsconfig*.json` to `globalDependencies` and `inputs` array to build task
- `packages/frontend/next.config.mjs` - Added `compress: true` and `productionBrowserSourceMaps: false`
- `packages/shared/src/formulas.ts` - Single-pass `sumSq` variance in `calculateCategorySGP`
- `packages/backend/src/agents/projections-ingest.ts` - Application-code batter/pitcher counting instead of JSONB SQL aggregation
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - `recPage` state, `RECS_PER_PAGE=10`, IIFE slice, page-offset rank numbers, pagination controls

## Decisions Made

- Used `sumSq/n - mean^2` formulation for single-pass variance (mathematically equivalent to population variance, avoids intermediate array)
- Chose SELECT + TypeScript loop over JSONB SQL aggregation for batter/pitcher classification — moves computation to app layer where it's more readable and testable
- Waivers pagination uses IIFE `(() => {...})()` pattern inline in JSX to keep `paginatedRecs` and `totalRecPages` computed close to render without extracting to a separate component

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The editor linter reverted the `projections-ingest.ts` edit once before accepting it on a second application. The change itself was correct — it was a race condition with the linter cache. Re-applied the identical edit and it persisted. TypeScript checks passed cleanly both times.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 5 issues (I-02, I-03, B-14, B-15, F-03) from the Performance Audit resolved. Phase 37 plan 06 is the final wave-2 plan in this phase. The performance audit fixes are complete across plans 01-06.

## Self-Check: PASSED

- FOUND: turbo.json
- FOUND: packages/frontend/next.config.mjs
- FOUND: packages/shared/src/formulas.ts
- FOUND: packages/backend/src/agents/projections-ingest.ts
- FOUND: packages/frontend/src/app/leagues/[id]/waivers/page.tsx
- FOUND: commit 4f7d260 (Task 1)
- FOUND: commit 8b8131c (Task 2)

---
*Phase: 37-app-performance-audit*
*Completed: 2026-03-09*

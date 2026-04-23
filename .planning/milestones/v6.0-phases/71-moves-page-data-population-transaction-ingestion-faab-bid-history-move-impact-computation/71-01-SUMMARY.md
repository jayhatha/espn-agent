---
phase: 71-moves-page-data-population
plan: 01
subsystem: api, ui
tags: [fastify, react, tanstack-query, transaction-impact, season-defaults]

# Dependency graph
requires:
  - phase: 65-dark-mode-shell
    provides: Shell layout and dark mode tokens used by moves page
provides:
  - Dynamic current-year season defaults in transaction-impact API
  - Compute Impacts button on moves page for one-click impact computation
  - Actionable empty-state messaging guiding users to compute impacts
affects: [moves-page, transaction-impact-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useMutation for expensive POST operations with loading/success/error states"
    - "queryClient.invalidateQueries to refresh related queries after mutation"

key-files:
  created: []
  modified:
    - packages/backend/src/api/transaction-impact.ts
    - packages/frontend/src/app/leagues/[id]/moves/page.tsx

key-decisions:
  - "new Date().getFullYear() for season defaults rather than config constant -- keeps API self-updating across seasons"
  - "Compute button placed in header flex row alongside team/season selectors for discoverability"

patterns-established:
  - "Dynamic season defaults: use new Date().getFullYear() not hardcoded year constants"

requirements-completed: [MOVES-01, MOVES-02, MOVES-03, MOVES-04]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 71 Plan 01: Moves Page Data Population Summary

**Dynamic season defaults in transaction-impact API + Compute Impacts button with actionable empty states on moves page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T22:20:00Z
- **Completed:** 2026-03-24T22:22:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced all 4 hardcoded 2025 season defaults with `new Date().getFullYear()` in transaction-impact API
- Added Compute Impacts button with useMutation loading/success/error states that triggers Shapley impact computation
- Replaced 3 vague empty-state messages with actionable guidance pointing users to the Compute Impacts button

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix hardcoded 2025 season defaults** - `93cf4c3` (fix)
2. **Task 2: Add Compute Impacts button and improve empty states** - `7e4b939` (feat)

## Files Created/Modified
- `packages/backend/src/api/transaction-impact.ts` - Replaced 4 hardcoded `2025` season defaults with `new Date().getFullYear()`
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx` - Added Compute Impacts button, useMutation hook, and improved empty-state messaging

## Decisions Made
- Used `new Date().getFullYear()` for dynamic season defaults rather than a config constant -- self-updating across seasons with zero maintenance
- Placed Compute button in the header flex row alongside team/season selectors for immediate discoverability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Moves page now returns current-year data by default and provides a one-click path to populate impact scores
- Transaction ingestion and FAAB bid history (remaining Phase 71 work) can build on this foundation

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 71-moves-page-data-population*
*Completed: 2026-03-24*

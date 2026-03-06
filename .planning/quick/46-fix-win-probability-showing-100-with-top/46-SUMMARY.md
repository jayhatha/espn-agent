---
phase: quick-46
plan: 01
subsystem: extension-engine
tags: [draft-simulator, win-probability, roto-scoring, rate-stats, budget-model]

# Dependency graph
requires:
  - phase: 28
    provides: Forward simulation engine (simulateFullDraft, computeSimStandings, buildSimDraftState)
provides:
  - Correct rate stat computation in simulation standings via formula_id on default categories
  - Realistic opponent budget estimation when opponent model lacks known budgets
  - Fair roto point distribution when teams are tied in a category
affects: [draft-engine, win-probability, decision-comparison, nomination-strategy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tie-aware roto scoring: tied teams share averaged positions instead of arbitrary assignment"
    - "Budget estimation from user context: initial budget = remainingBudget + mySpent, then subtract opponent known spend"

key-files:
  created: []
  modified:
    - packages/extension/entrypoints/content.tsx
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/engine/draft-simulator.ts

key-decisions:
  - "Add formula_id inline to content.tsx fallback instead of importing getDefault5x5Categories -- avoids DOM dependency complications in content script entry"
  - "Estimate initial budget from user's own remaining + spent data -- only reliable budget reference available when opponent model has no data"
  - "Standard roto tie-handling: average the roto points across tied positions rather than arbitrary sort-order assignment"

patterns-established:
  - "Tie-aware roto: always check for tied values when assigning roto points in any standings computation"

requirements-completed: [WIN-PROB-FIX]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Quick-46: Fix Win Probability Showing ~100% Summary

**Three independent bugs fixed: missing formula_id on rate categories, opponent budget inheriting user's depleted budget, and arbitrary roto point assignment for tied teams**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T19:27:50Z
- **Completed:** 2026-03-06T19:29:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Rate stats (AVG, ERA, WHIP) now produce real computed values in simulation standings instead of 0 for all teams
- Opponents without known budgets get estimated initial budget minus their known spend, not the user's depleted $5 budget
- Teams tied in a roto category share averaged points instead of receiving arbitrarily different points based on sort order
- All 139 existing extension tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add formula_id to default RATE categories** - `523dbc0` (fix)
2. **Task 2: Fix opponent budget fallback and roto tie-handling** - `10f6f9d` (fix)

## Files Created/Modified
- `packages/extension/entrypoints/content.tsx` - Added formula_id and required_components to AVG, ERA, WHIP in fallback default categories
- `packages/extension/lib/engine/index.ts` - Replaced opponent budget fallback (was: user's remainingBudget, now: estimated initial budget minus opponent's known spend)
- `packages/extension/lib/engine/draft-simulator.ts` - Replaced simple roto point loop with tie-aware averaging algorithm

## Decisions Made
- Added formula_id inline rather than refactoring to import getDefault5x5Categories -- avoids DOM dependency complications in content script entry point
- Budget estimation derives initial budget from user's own data (remainingBudget + mySpent) then subtracts opponent's known spend from allPicks -- only reliable reference when opponent model lacks budget data
- Standard roto tie-handling averages points across tied positions -- consistent with real roto league scoring rules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in other files (DraftSidebar.tsx, PlayerCard.tsx, background.ts, popup, tests) -- none in the files modified by this plan. The `ShoppingListSignal.groups` error in index.ts is also pre-existing from a previous phase's uncommitted type changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Win probability simulation now produces realistic values reflecting actual roster composition
- Forward simulation, decision comparison, and nomination strategy all benefit from these fixes
- No blockers

---
*Phase: quick-46*
*Completed: 2026-03-06*

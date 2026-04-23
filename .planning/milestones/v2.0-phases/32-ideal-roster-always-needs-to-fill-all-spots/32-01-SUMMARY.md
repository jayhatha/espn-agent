---
phase: 32-ideal-roster-always-needs-to-fill-all-spots
plan: 01
subsystem: extension
tags: [roster-optimizer, knapsack, backfill, typescript, vitest, tdd]

# Dependency graph
requires: []
provides:
  - canFillSlot helper in roster-optimizer.ts (checks if player can fill a specific slot)
  - Phase 3b backfill pass in optimizeRoster (force-fills unfilled slots after greedy pass)
  - Guaranteed unfilledSlots === 0 when eligible players exist in pool
affects:
  - extension ideal roster panel (now always shows complete team)
  - Phase 4 budget upgrade pass (now triggers more often, after backfill fills remaining slots)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backfill after greedy: force-fill cheapest eligible player into unfilled slots post-reserve-constrained greedy pass"
    - "canFillSlot vs findBestSlot: inverted APIs — findBestSlot takes player and finds slot, canFillSlot takes slot and checks player eligibility"
    - "TDD with spec-driven test cases: plan provides exact input/output scenarios for each backfill case"

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/roster-optimizer.ts
    - packages/extension/lib/__tests__/roster-optimizer.test.ts

key-decisions:
  - "Backfill selects cheapest eligible player (not most efficient) — emergency fill mode prioritizes slot coverage over SGP/$"
  - "Tie-break on price: prefer higher raw SGP so backfill still gets some value"
  - "canFillSlot is a separate helper from findBestSlot — APIs are inverted so code reuse would invert the iteration logic"
  - "Backfill entries added to greedyEntries so Phase 4 upgrade pass can upgrade backfill picks after all slots are filled"
  - "usedInRoster Set built from roster before backfill starts to prevent double-placing a player"

patterns-established:
  - "Phase 3b (backfill) sits between Phase 3 (greedy) and Phase 4 (upgrade) — slot fill guarantee before value optimization"

requirements-completed:
  - ROSTER-FILL-01

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 32 Plan 01: Roster Optimizer Backfill Pass Summary

**canFillSlot helper + Phase 3b backfill pass added to roster-optimizer.ts, guaranteeing unfilledSlots === 0 whenever eligible players exist in the pool**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-08T19:18:27Z
- **Completed:** 2026-03-08T19:21:02Z
- **Tasks:** 2 (RED + GREEN; no refactor needed)
- **Files modified:** 2

## Accomplishments
- Added `canFillSlot` helper (reverse of `findBestSlot`: given a slot, checks if a player can fill it)
- Added Phase 3b backfill pass after greedy fill: iterates unfilled slots in SLOT_PRIORITY order, force-places cheapest eligible player regardless of budget
- Updated 2 existing tests to reflect new backfill behavior (renamed and fixed assertions)
- Added 5 new backfill test cases: tight budget, position constraint, normal no-op, empty pool, SGP tie-breaking

## Task Commits

Each task was committed atomically:

1. **TDD RED: Write failing tests** - `f6d7627` (test)
2. **TDD GREEN: Implement canFillSlot + backfill pass** - `a414119` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks — RED committed first with failing tests, GREEN committed with implementation making all tests pass_

## Files Created/Modified
- `packages/extension/lib/engine/roster-optimizer.ts` - Added `canFillSlot` helper function + Phase 3b backfill pass between Phase 3 (greedy) and Phase 4 (budget upgrade)
- `packages/extension/lib/__tests__/roster-optimizer.test.ts` - Updated 2 existing tests to match new backfill behavior; added 5 new backfill test cases covering all plan scenarios

## Decisions Made
- **canFillSlot vs findBestSlot:** These have inverted APIs (`findBestSlot` iterates slots to find best for a player; `canFillSlot` takes a slot and checks if a player can fill it). Keeping them separate avoids awkward API inversion.
- **Backfill uses cheapest player (not most efficient):** Backfill is emergency fill — slot coverage is the goal, not SGP/$ optimization. Phase 4 upgrade pass can improve backfill picks afterward.
- **Tie-break by higher SGP:** When two players cost the same, prefer the one with higher raw SGP to get some value from the forced pick.
- **usedInRoster Set:** Built from `roster` array before backfill loop to prevent any player being placed in two slots.
- **Entries added to greedyEntries:** Backfill placements are tracked so Phase 4 can upgrade them too (consistent with greedy entries).

## Deviations from Plan

None - plan executed exactly as written. Both implementation changes and all test updates/additions matched the spec.

## Issues Encountered
- Pre-existing TypeScript errors in other extension files (entrypoints, api-client.ts, archetype tests) — out of scope per deviation rules, not touched. The roster-optimizer files have zero TypeScript errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ideal roster panel will now always show a complete team whenever eligible players exist in the available pool
- Phase 4 budget upgrade pass will now trigger more frequently (backfill fills slots that greedy couldn't, satisfying the `slotsToFill === 0` gate)
- No breaking API changes — function signature and return type (RosterOptimizationResult) unchanged

## Self-Check: PASSED

- roster-optimizer.ts: FOUND
- roster-optimizer.test.ts: FOUND
- SUMMARY.md: FOUND
- Commit f6d7627 (RED): FOUND
- Commit a414119 (GREEN): FOUND
- canFillSlot in optimizer: FOUND
- backfill pass in optimizer: FOUND
- backfill tests: FOUND

---
*Phase: 32-ideal-roster-always-needs-to-fill-all-spots*
*Completed: 2026-03-08*

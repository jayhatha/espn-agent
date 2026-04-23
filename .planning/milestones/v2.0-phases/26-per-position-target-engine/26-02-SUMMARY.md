---
phase: 26-per-position-target-engine
plan: 02
subsystem: extension
tags: [typescript, vitest, auction-draft, sgp, shopping-list, position-targeting, draft-engine]

# Dependency graph
requires:
  - phase: 26-01
    provides: computeShoppingList pure function, ShoppingListSignal type, PositionTarget, PositionGroup interfaces
  - phase: 23-roster-optimization-engine
    provides: EnhancedScarcitySignal type, computeRosterOptimization function structure

provides:
  - "computeShoppingList called inside computeRosterOptimization with scarcity signals threaded through"
  - "DraftEngineSignals.optimization.shoppingList populated as ShoppingListSignal | null (was always null)"
  - "scarcitySignals parameter added to computeRosterOptimization signature"
  - "ShoppingListSignal, PositionGroup, PositionTarget re-exported from engine/index.ts"
  - "2 integration-style tests verifying TARG-04 (filled positions drop off) and PRIO-03 (priority re-sorts)"

affects:
  - phase-27-shopping-list-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thread-through pattern: scarcity signals computed in computeDraftEngine() and passed as parameter to computeRosterOptimization() to avoid re-computation"
    - "Try/catch with console.warn wrapping shopping list call — engine continues if shopping list fails"
    - "Performance timing log only when > 10ms threshold to avoid noise"

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/__tests__/shopping-list.test.ts

key-decisions:
  - "scarcitySignals passed as parameter (not re-computed) — computeEnhancedScarcity already runs in computeDraftEngine step 2, threading avoids double work"
  - "Shopping list in try/catch with null fallback — non-critical signal, engine must not crash if shopping list fails for any reason"

patterns-established:
  - "computeRosterOptimization signature: (input, inflation, projectedStandings, scarcitySignals) — all downstream signals from computeDraftEngine flow through as parameters"

requirements-completed: [TARG-04, PRIO-03]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 26 Plan 02: Wire Shopping List into Draft Engine Summary

**computeShoppingList wired into computeRosterOptimization via scarcity signal thread-through, with 2 integration tests proving TARG-04 (filled positions drop off) and PRIO-03 (priority re-sorts) dynamic behavior**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T07:33:22Z
- **Completed:** 2026-03-06T07:35:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `computeShoppingList()` into `computeRosterOptimization()` — `DraftEngineSignals.optimization.shoppingList` now returns a populated `ShoppingListSignal | null` instead of always being `null`
- Threaded scarcity signals from `computeDraftEngine()` step 2 down to `computeRosterOptimization()` via a new parameter, giving the shopping list access to per-position scarcity indices
- Exported `ShoppingListSignal`, `PositionGroup`, `PositionTarget` from `engine/index.ts` for downstream consumers (Phase 27 UI)
- Added 2 integration tests confirming: (1) filled positions drop from the shopping list when removed from `needByPosition`, and (2) priority ordering inverts when scarcity values swap between SS and OF

## Task Commits

1. **Task 1: Wire computeShoppingList into computeRosterOptimization** - `98839c4` (feat)
2. **Task 2: Integration tests for dynamic behavior** - `c7d6c92` (test)

## Files Created/Modified

- `packages/extension/lib/engine/index.ts` — Imported `computeShoppingList`, added `scarcitySignals` param to `computeRosterOptimization`, call with allPlayers/sgpValues/needByPosition/remainingSlots/scarcitySignals/opponentModel/myBudget/weakCategories, returns populated `shoppingList`, exports ShoppingListSignal/PositionGroup/PositionTarget
- `packages/extension/lib/__tests__/shopping-list.test.ts` — Added Test 13 (TARG-04: dynamic roster fill drops SS group) and Test 14 (PRIO-03: scarcity swap re-sorts OF before SS then SS before OF)

## Decisions Made

- `scarcitySignals` passed as parameter rather than re-computing inside `computeRosterOptimization` — avoids calling `computeEnhancedScarcity` twice; it already runs in `computeDraftEngine` step 2
- Shopping list wrapped in `try/catch` returning `null` on failure — the shopping list is a non-critical signal; the engine must not crash if it fails for edge-case inputs

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors (33 errors in api-client.ts, entrypoints, draft-state.ts, etc.) were all present before execution. Zero new errors introduced by this plan's changes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `DraftEngineSignals.optimization.shoppingList` is now a live `ShoppingListSignal | null`
- Phase 27 (Shopping List UI) can read `engineSignals.optimization?.shoppingList?.positionGroups` to render collapsible position group cards
- The shopping list recomputes on every pick via the existing `useDraftEngineSignals` useMemo on `allPicks` changes — no additional wiring needed in the hook
- 110 tests passing; zero regressions

## Self-Check: PASSED

- packages/extension/lib/engine/index.ts: FOUND
- packages/extension/lib/__tests__/shopping-list.test.ts: FOUND
- .planning/phases/26-per-position-target-engine/26-02-SUMMARY.md: FOUND
- Commit 98839c4: FOUND
- Commit c7d6c92: FOUND

---
*Phase: 26-per-position-target-engine*
*Completed: 2026-03-06*

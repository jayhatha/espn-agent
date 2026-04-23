---
phase: 30-extension-perf-audit
plan: 01
subsystem: ui
tags: [chrome-extension, draft-engine, performance, cleanup]

# Dependency graph
requires:
  - phase: 27-shopping-list-ui
    provides: ShoppingList component and shopping-list.ts engine module
  - phase: 26-per-position-target-engine
    provides: league-analysis.ts engine module with team stat aggregation
provides:
  - Leaner draft engine without shopping list or league analysis computation overhead
  - Inline team stat aggregation (teamDraftedTotals/Components) for projected standings and simulation
  - Draft targets sourced from top-SGP pool players instead of shopping list position groups
affects: [extension-sidebar, draft-engine, forward-simulation, projected-standings]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-team-stat-aggregation, module-level-projection-map-caching]

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/components/EngineInsights.tsx
    - packages/extension/lib/engine/projected-standings.ts
  deleted:
    - packages/extension/lib/engine/shopping-list.ts
    - packages/extension/lib/engine/league-analysis.ts
    - packages/extension/components/ShoppingList.tsx
    - packages/extension/lib/__tests__/shopping-list.test.ts

key-decisions:
  - "Remove shopping list and league analysis entirely per user directive to reduce computation cost"
  - "Extract team stat aggregation (teamDraftedTotals/Components) inline into computeDraftEngine instead of delegating to league-analysis.ts"
  - "Use module-level cachedHitterProjMap/cachedPitcherProjMap to avoid rebuilding projection maps each engine call"
  - "Draft targets now source candidates from top-5 players by adjusted SGP value instead of shopping list position groups"
  - "buildSimDraftState signature updated to accept teamDraftedTotals/Components directly (no more LeagueAnalysisSignal param)"

patterns-established:
  - "Inline stat aggregation: critical shared data computed inline in orchestrator, not delegated to feature modules"
  - "Module-level cache for static FG projection maps: built once, reused across all engine calls"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-07
---

# Phase 30 Plan 01: Remove Shopping List and League Analysis Summary

**Shopping list and league positional demand analysis removed from extension; team stat aggregation extracted inline with module-level projection map caching for projected standings and forward simulation continuity**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T23:31:04Z
- **Completed:** 2026-03-07T23:36:00Z
- **Tasks:** 2
- **Files modified:** 4 (+ 4 deleted)

## Accomplishments
- Fully removed shopping list module, league analysis module, ShoppingList component, and shopping-list tests
- Extracted team stat aggregation logic inline in `computeDraftEngine` with module-level FG projection map caching
- Projected standings and forward simulation continue to receive `teamDraftedTotals`/`teamDraftedComponents` without disruption
- Draft targets now source from top-5 players by adjusted SGP instead of shopping list position groups
- Extension builds clean with zero new TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove shopping list and league analysis modules, types, and UI** - `be9d667` (feat)
2. **Task 2: Extract team stat aggregation inline, fix draft targets** - `0d5f062` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/extension/lib/engine/index.ts` - Removed league-analysis/shopping-list imports; added inline stat aggregation; updated buildSimDraftState signature; replaced shopping-list-based draft targets with top-SGP sourcing; removed leagueAnalysis from return
- `packages/extension/lib/engine/types.ts` - Removed ShoppingListSignal, PositionTarget, PositionGroup, LeagueAnalysisSignal, TeamCategoryRanking, CategoryDemand interfaces; removed shoppingList from RosterOptimizationSignal; removed leagueAnalysis from DraftEngineSignals
- `packages/extension/components/EngineInsights.tsx` - Removed ShoppingList import, render, and League Analysis section
- `packages/extension/lib/engine/projected-standings.ts` - Updated JSDoc to remove league-analysis references
- `packages/extension/lib/engine/shopping-list.ts` - Deleted
- `packages/extension/lib/engine/league-analysis.ts` - Deleted
- `packages/extension/components/ShoppingList.tsx` - Deleted
- `packages/extension/lib/__tests__/shopping-list.test.ts` - Deleted

## Decisions Made
- Used module-level `cachedHitterProjMap`/`cachedPitcherProjMap` to avoid rebuilding these maps on every engine call (they reference static bundled data that never changes at runtime)
- Draft targets use `allPlayersOpt.sort by adjustedSgpValuesOpt` — same adjusted SGP values used everywhere else in the engine, ensuring consistency
- Removed `optimization` from EngineInsights destructuring since it was only used for ShoppingList which is now gone

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `optimization` destructuring from EngineInsights**
- **Found during:** Task 1 (EngineInsights cleanup)
- **Issue:** After removing ShoppingList render, `optimization` was destructured but never referenced — would cause lint warnings
- **Fix:** Removed `optimization` from the destructured `engineSignals` in EngineInsights.tsx
- **Files modified:** packages/extension/components/EngineInsights.tsx
- **Verification:** No unused variable warnings
- **Committed in:** be9d667 (Task 1 commit)

**2. [Rule 1 - Bug] Changed import.meta.env.DEV guard to plain console.warn**
- **Found during:** Task 2 (draft targets implementation)
- **Issue:** Plan example used `import.meta.env.DEV` which TypeScript flags as an error in the extension tsconfig
- **Fix:** Replaced with unconditional `console.warn` (consistent with other crash handlers in the same file)
- **Files modified:** packages/extension/lib/engine/index.ts
- **Verification:** `npx tsc --noEmit` passes with no errors in engine directory
- **Committed in:** 0d5f062 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs)
**Impact on plan:** Both auto-fixes necessary for code quality and TypeScript compliance. No scope creep.

## Issues Encountered
None - plan executed cleanly.

## Next Phase Readiness
- Shopping list and league analysis are fully removed — extension sidebar shows Win Probability, Ideal Roster, Draft Targets, Nomination Strategy
- Plan 02 (additional perf/quality improvements) can proceed

---
*Phase: 30-extension-perf-audit*
*Completed: 2026-03-07*

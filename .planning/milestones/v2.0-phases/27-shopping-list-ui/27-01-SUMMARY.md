---
phase: 27-shopping-list-ui
plan: 01
subsystem: ui
tags: [react, extension, chrome-extension, tailwind, draft-engine]

# Dependency graph
requires:
  - phase: 26-per-position-target-engine
    provides: ShoppingListSignal, PositionGroup, PositionTarget types and computeShoppingList engine output
provides:
  - ShoppingList.tsx presentational component with position-grouped collapsible target lists
  - EngineInsights.tsx updated to render ShoppingList replacing flat Top Targets section
affects: [EngineInsights, DraftSidebar, shopping-list-engine, narrator-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outer details/summary uses open + group class for Tailwind group-open variant; inner details omit group class to avoid CSS conflict"
    - "Priority badge helper returns label + classes tuple for 3-tier urgency: HIGH/MED/LOW with negative/warning/info color tokens"
    - "Null guard at component root returns null for missing signal data — engine returns null until roster optimization data is available"

key-files:
  created:
    - packages/extension/components/ShoppingList.tsx
  modified:
    - packages/extension/components/EngineInsights.tsx

key-decisions:
  - "Inner PositionGroupSection <details> elements collapsed by default (no open attribute) so user can focus on highest-priority position group without visual noise"
  - "Do not re-sort positionGroups in UI — engine outputs groups in priorityScore descending order, preserving SHOP-04 requirement"
  - "optimization?.shoppingList ?? null passed as prop — handles both null optimization (no nomination) and null shoppingList (engine error/early state) gracefully"

patterns-established:
  - "Priority badge: score>=0.7 → HIGH/negative colors, >=0.45 → MED/warning, <0.45 → LOW/info"
  - "Shopping list empty state: compact centered text 'Roster positions filled' when positionGroups.length === 0"
  - "PlayerRow shows: name (truncate max-w-[100px]) | $maxBid | ~$expectedMarketPrice | +/-surplus with positive/negative colors"

requirements-completed: [SHOP-01, SHOP-02, SHOP-03, SHOP-04, SHOP-05]

# Metrics
duration: 1min
completed: 2026-03-06
---

# Phase 27 Plan 01: Shopping List UI Summary

**Position-grouped collapsible shopping list component replacing flat Top Targets in the extension sidebar, with HIGH/MED/LOW urgency badges, max bid, expected market price, and value surplus per player**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-06T07:51:04Z
- **Completed:** 2026-03-06T07:52:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `ShoppingList.tsx` with `PositionGroupSection` (collapsible, collapsed by default) and `PlayerRow` sub-components
- Priority badge helper with 3-tier thresholds (HIGH >= 0.7, MED >= 0.45, LOW < 0.45) using design token color classes
- Replaced 40-line Top Targets block (including MC Simulation footer) in EngineInsights with a single `<ShoppingList>` line
- Empty state renders "Roster positions filled" when all roster positions are filled (SHOP-05)
- Engine-provided sort order preserved — no re-sorting in UI (SHOP-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ShoppingList.tsx component** - `511d542` (feat)
2. **Task 2: Replace Top Targets with ShoppingList in EngineInsights** - `a9c283e` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified
- `packages/extension/components/ShoppingList.tsx` - New position-grouped shopping list component (98 lines)
- `packages/extension/components/EngineInsights.tsx` - Top Targets block removed, ShoppingList imported and rendered

## Decisions Made
- Inner `PositionGroupSection` `<details>` elements collapsed by default — user reviews shopping list on demand per position
- No nested `group` class on inner details elements to avoid Tailwind `group-open:*` interference at multiple nesting levels
- `optimization?.shoppingList ?? null` prop threading handles both null optimization and null shoppingList states gracefully

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
Pre-existing TypeScript errors in other extension files (DraftSidebar.tsx, PlayerCard.tsx, api-client.ts, draft-state.ts, test files) were present before this plan and are out of scope per deviation rule scope boundary. ShoppingList.tsx and EngineInsights.tsx introduced zero new TypeScript errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ShoppingList component is complete and rendering in sidebar when engine outputs shoppingList data
- Phase 27 Plan 02 (if any) can build on this UI foundation
- Pre-existing TypeScript errors in extension package are deferred items for a future cleanup phase

## Self-Check: PASSED

- packages/extension/components/ShoppingList.tsx: FOUND
- .planning/phases/27-shopping-list-ui/27-01-SUMMARY.md: FOUND
- Commit 511d542 (Task 1): FOUND
- Commit a9c283e (Task 2): FOUND

---
*Phase: 27-shopping-list-ui*
*Completed: 2026-03-06*

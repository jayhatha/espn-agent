---
phase: 20-deterministic-draft-engine
plan: 02
subsystem: extension
tags: [draft-engine, react-hook, zustand, usememo, auction, budget-tracker, alerts, sidebar]
dependency_graph:
  requires:
    - packages/extension/lib/engine/index.ts (computeDraftEngine from Plan 01)
    - packages/extension/lib/engine/types.ts (DraftEngineSignals, DraftAlert)
    - packages/extension/lib/draft-state.ts (useDraftStore)
    - packages/extension/components/AuctionBudgetTracker.tsx
    - packages/extension/components/DraftSidebar.tsx
  provides:
    - packages/extension/lib/use-draft-engine.ts (useDraftEngineSignals hook)
    - packages/extension/components/EngineAlerts.tsx (severity-sorted alert badges)
    - packages/extension/components/EngineInsights.tsx (inflation/category-gap/scarcity panel)
  affects:
    - Phase 20 complete (both plans done)
tech_stack:
  added: []
  patterns:
    - useMemo with selective deps to exclude high-frequency Zustand state (currentAuctionPlayer)
    - teamRosters.size in deps array instead of Map ref to avoid stale closure issues
    - engineSignals prop pattern for graceful fallback in upgraded components
    - DEV-only performance indicator pattern via import.meta.env.DEV
key_files:
  created:
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/components/EngineAlerts.tsx
    - packages/extension/components/EngineInsights.tsx
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/AuctionBudgetTracker.tsx
decisions:
  - "useDraftEngineSignals excludes currentAuctionPlayer from useMemo deps to prevent 200ms recomputes from MutationObserver -- engine updates on allPicks change instead"
  - "teamRosters.size used in deps array instead of Map reference -- prevents stale reference issues with Zustand Map state"
  - "AuctionBudgetTracker accepts optional engineSignals prop with graceful fallback to calculateBudgetPacing -- works for snake drafts and pre-data states"
  - "import.meta.env.DEV pattern used in DraftSidebar for DEV-only performance indicator -- same pattern as content.tsx entrypoint"

requirements_completed:
  - ENGINE-01
  - ENGINE-02
  - ENGINE-03
  - ENGINE-04
  - ENGINE-05

duration: 3min
completed: 2026-03-04
tasks_completed: 2
files_created: 3
files_modified: 2
---

# Phase 20 Plan 02: UI Integration of Deterministic Draft Engine Summary

**React hook bridging Zustand state to engine, plus EngineAlerts badge grid and EngineInsights collapsible panel wired into auction sidebar with upgraded budget tracker showing inflation-adjusted max bid.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T06:15:49Z
- **Completed:** 2026-03-04T06:18:56Z
- **Tasks:** 2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Created `useDraftEngineSignals` hook that bridges Zustand state to `computeDraftEngine` via useMemo with correct dependency list (excludes `currentAuctionPlayer` to avoid 200ms recomputes from MutationObserver)
- Created `EngineAlerts` component rendering severity-sorted `DraftAlert[]` badges with color-coded types (inflation=blue, scarcity/tier_break=red, category_gap=amber) and severity progress bar
- Created `EngineInsights` collapsible panel showing inflation %, category gap z-scores with visual bars, and top 3 scarcity positions with supply/demand numbers
- Upgraded `AuctionBudgetTracker` to accept `engineSignals` prop and display engine's inflation-adjusted max bid with inflation percentage badge and Fair Value line; graceful fallback to `calculateBudgetPacing` when engine signals unavailable
- Updated `DraftSidebar` to render engine alerts at top of auction sidebar, followed by upgraded budget tracker and engine insights; snake draft branch completely unchanged; DEV-only compute time indicator

## Task Commits

1. **Task 1: Create useDraftEngineSignals hook, EngineAlerts, and EngineInsights** - `87c9e30` (feat)
2. **Task 2: Integrate engine into DraftSidebar and upgrade AuctionBudgetTracker** - `8c05861` (feat)

## Files Created/Modified

- `packages/extension/lib/use-draft-engine.ts` - `useDraftEngineSignals` hook: reads Zustand state, calls computeDraftEngine via useMemo with selective deps
- `packages/extension/components/EngineAlerts.tsx` - Alert badges sorted by severity with color-coding by type and severity bar
- `packages/extension/components/EngineInsights.tsx` - Collapsible panel: inflation %, category gap z-score bars, top scarcity positions
- `packages/extension/components/DraftSidebar.tsx` - Integrates engine hook + 3 new components in auction branch; removed calculateBudgetPacing import; uses remainingBudget directly
- `packages/extension/components/AuctionBudgetTracker.tsx` - Accepts engineSignals prop; uses budget curve data when available; shows inflation % badge and Fair Value

## Decisions Made

- `useDraftEngineSignals` excludes `currentAuctionPlayer` from useMemo deps — MutationObserver fires every 200ms on bid changes, this would cause constant expensive recomputes. Engine updates on `allPicks` change (once per completed pick) instead.
- `teamRosters.size` used in deps array instead of the Map reference — prevents stale closure issues with Zustand Map state (Pitfall #6 from research doc).
- `AuctionBudgetTracker` accepts optional `engineSignals` prop with graceful fallback — works for snake drafts and pre-data states without engine signals.
- `import.meta.env.DEV` used in DraftSidebar for DEV-only indicator — same WXT/Vite pattern as `content.tsx` entrypoint (TypeScript standalone check flags it but WXT runtime provides the type).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

The `import.meta.env.DEV` reference in DraftSidebar caused one additional TypeScript error in standalone tsc check (26 pre-existing → 27 after). This is the same WXT/Vite runtime type issue as the 3 existing errors in `content.tsx` (lines 122, 567). The plan explicitly specified this pattern. No fix needed — WXT provides the type at build time.

No errors in any of the 5 new/modified files from this plan specifically.

## Self-Check

- [x] `packages/extension/lib/use-draft-engine.ts` exists and exports `useDraftEngineSignals`
- [x] `packages/extension/components/EngineAlerts.tsx` exists and exports default component
- [x] `packages/extension/components/EngineInsights.tsx` exists and exports default component
- [x] `DraftSidebar.tsx` renders EngineAlerts, EngineInsights, and passes engineSignals to AuctionBudgetTracker
- [x] `AuctionBudgetTracker.tsx` uses engine budget curve when available, falls back when null
- [x] Snake draft branch unchanged (RosterSummary, PositionScarcityAlerts, SnakeTurnPairs, DraftRecommendations)
- [x] `grep -r "useDraftStore" engine/` returns zero results (engine stays pure)
- [x] Commit 87c9e30 exists (Task 1)
- [x] Commit 8c05861 exists (Task 2)

## Self-Check: PASSED

All files created and committed. Engine remains pure (no Zustand calls in engine/). Snake draft unchanged. TypeScript errors in new files: zero.

## Next Phase Readiness

Phase 20 complete — both plans executed. The deterministic draft engine is fully wired:
- Plan 01: Pure engine functions (inflation, scarcity, category-gap, budget-curve, alerts) + Zustand store extensions
- Plan 02: React hook + UI components (EngineAlerts, EngineInsights, upgraded AuctionBudgetTracker, integrated DraftSidebar)

Ready for live auction draft testing. Engine recomputes only on `allPicks`/`myRoster`/`remainingBudget` changes — not on every bid increment.

---
*Phase: 20-deterministic-draft-engine*
*Completed: 2026-03-04*

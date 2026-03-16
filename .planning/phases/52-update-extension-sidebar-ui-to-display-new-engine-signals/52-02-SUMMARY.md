---
phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals
plan: 02
subsystem: ui
tags: [react, tailwind, grafana, extension, draft-sidebar, heatmap]

# Dependency graph
requires:
  - phase: 52-01
    provides: Grafana dark palette Tailwind tokens and store defaults for v5.0 sidebar

provides:
  - SignalStrip component: 4-badge compact signal row (endgame, inflation band, budget split, SP tier)
  - CategoryHeatmap component: horizontal bar heatmap with click-toggle between rank and stat views
  - PositionSupplyHeatmap component: drafted-vs-total position supply grid with color thresholds
  - NextNominee component: single next-nominee card with strategy tag derivation and active nominating state

affects: [52-03-plan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grafana dark palette via explicit Tailwind tokens (no dark: variants — Shadow DOM constraint)"
    - "Inline useMemo for position supply derivation from rankings + allPicks"
    - "Rank-to-4-color mapping function for category heatmap bars"
    - "Strategy tag derivation from nomination reason string"

key-files:
  created:
    - packages/extension/components/SignalStrip.tsx
    - packages/extension/components/CategoryHeatmap.tsx
    - packages/extension/components/PositionSupplyHeatmap.tsx
    - packages/extension/components/NextNominee.tsx
  modified: []

key-decisions:
  - "All components receive data via props (not direct store access) for clean integration in Plan 03"
  - "CategoryHeatmap uses useState for rank/stat toggle — no store needed"
  - "PositionSupplyHeatmap derives supply inline with useMemo from rankings + allPicks"
  - "NextNominee strategy tag derived from nomination reason string at render time"

patterns-established:
  - "Pattern 1: rank-to-color uses 4 thresholds (0.25/0.50/0.75) with Grafana green/yellow/orange-red/red hex values"
  - "Pattern 2: bar width = (totalTeams - rank + 1) / totalTeams * 100 for rank visualization"
  - "Pattern 3: position filter via r.positions.some(p => p.toUpperCase().includes(pos)) matching existing pattern"

requirements-completed:
  - UI-SIGNAL-STRIP
  - UI-CATEGORY-HEATMAP
  - UI-POSITION-SUPPLY
  - UI-NEXT-NOMINEE

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 52 Plan 02: New Sidebar Signal Components Summary

**Four Grafana dark mode React components for v5.0 sidebar: SignalStrip (4-badge row), CategoryHeatmap (rank/stat toggle), PositionSupplyHeatmap (drafted-vs-pool grid), NextNominee (strategy tag card)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-16T00:00:00Z
- **Completed:** 2026-03-16T00:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- SignalStrip renders 4 signal badges (endgame NORMAL/ENDGAME always visible, inflation band, budget split %, SP tier count) using Grafana palette
- CategoryHeatmap renders horizontal bars per scoring category with rank-to-color gradient, click-toggle between projected rank and stat totals, empty state with skeleton placeholders
- PositionSupplyHeatmap derives supply counts inline via useMemo over rankings + allPicks using SUPPLY_POOL_SIZES constants, with green/yellow/red color thresholds
- NextNominee shows strategy tag derived from nomination reason string with active "Nominating..." pulse animation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SignalStrip and NextNominee components** - `26f0409` (feat)
2. **Task 2: Create CategoryHeatmap and PositionSupplyHeatmap components** - `504b127` (feat)

## Files Created/Modified

- `packages/extension/components/SignalStrip.tsx` - 4-badge compact signal row with endgame, inflation band, budget split, SP tier count
- `packages/extension/components/NextNominee.tsx` - Single next-nominee card with strategy tag derivation and active nominating pulse animation
- `packages/extension/components/CategoryHeatmap.tsx` - Horizontal bar heatmap per scoring category with rank-to-color gradient and click-toggle rank/stat view
- `packages/extension/components/PositionSupplyHeatmap.tsx` - Position supply grid showing drafted-vs-pool-size bars for 8 positions with color thresholds

## Decisions Made

- All components receive data via props rather than reading directly from the Zustand store — clean interface for Plan 03 wiring
- CategoryHeatmap keeps toggle state local (useState) since it's purely display-local state
- PositionSupplyHeatmap sorts by externalRank ascending to define "top N" — consistent with scarcity engine pattern
- NextNominee handles null nominee by returning null (not empty container) to avoid dead space in sidebar

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in other extension files (PlayerCard.tsx, content.tsx, popup/index.tsx, archetype.test.ts) were noted and left untouched — out of scope per deviation rules. None of the new components introduced any TypeScript errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 new components are ready for integration into DraftSidebar.tsx in Plan 03
- Components accept props matching DraftEngineSignals fields exactly — no interface changes needed
- CategoryHeatmap expects `ProjectedStandingsSignal | null` — handles null gracefully with skeleton UI
- PositionSupplyHeatmap expects `DraftRanking[]` and `DraftPick[]` — both available from draft store

---
*Phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals*
*Completed: 2026-03-16*

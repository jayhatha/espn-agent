---
phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals
plan: 03
subsystem: ui
tags: [react, tailwind, grafana, extension, draft-sidebar, dark-mode]

# Dependency graph
requires:
  - phase: 52-01
    provides: Grafana dark palette Tailwind tokens and store defaults
  - phase: 52-02
    provides: SignalStrip, CategoryHeatmap, PositionSupplyHeatmap, NextNominee components

provides:
  - Redesigned DraftSidebar with locked section order and Grafana dark palette
  - Dark-mode BidVerdict card (narrator removed, grafana tokens)
  - Dark-mode IdealRosterPanel with full player list and category progress bars
  - Dark-mode AuctionRecommendations showing top 10 (reduced from 50)
  - Simplified EngineInsights — thin wrapper rendering only IdealRosterPanel

affects: [future-extension-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grafana dark palette applied consistently across all auction-rendered components"
    - "valueCaptured computed via useMemo over myRoster + auctionValues for header display"
    - "Tier badge derived from CSV market value thresholds: >$20=anchor, >=$5=core, else value"
    - "Nominated player display uses auctionValues.find() only — no espnDomAuctionValues in display"

key-files:
  created: []
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/BidVerdict.tsx
    - packages/extension/components/IdealRosterPanel.tsx
    - packages/extension/components/AuctionRecommendations.tsx
    - packages/extension/components/EngineInsights.tsx

key-decisions:
  - "DraftNarrator, AuctionBudgetTracker, PositionScarcityAlerts files preserved but not imported/rendered"
  - "Hit/pitch split slider removed from auto-pilot section (value still used by engine, just no UI)"
  - "Snake draft path in DraftSidebar left unchanged (light mode deferred)"
  - "EngineInsights kept as thin wrapper (not inlined) to preserve ErrorBoundary structure in DraftSidebar"

patterns-established:
  - "Pattern: Tier badge from market value thresholds (>20 anchor, >=5 core, else value) — consistent with IdealRosterPanel"
  - "Pattern: Section order locked as Header, Auto-pilot, Nominated+BidVerdict, SignalStrip, NextNominee, NominationDiagnostics, CategoryHeatmap, PositionSupplyHeatmap, EngineInsights, AuctionRecommendations"

requirements-completed:
  - UI-SECTION-ORDER
  - UI-DARK-RESKIN
  - UI-REMOVALS
  - UI-NOMINATED-PLAYER
  - UI-HEADER
  - UI-AUCTION-RECS

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 52 Plan 03: DraftSidebar Redesign + Component Reskin Summary

**Complete Grafana dark-mode sidebar with locked 10-section order, CSV-only nominated player display, value captured header, top-10 auction recs, and simplified EngineInsights**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-16T18:49:23Z
- **Completed:** 2026-03-16T18:53:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- DraftSidebar rewritten with locked section order: Header (value captured) → Auto-pilot (no slider) → Nominated+BidVerdict → SignalStrip → NextNominee → NominationDiagnostics → CategoryHeatmap → PositionSupplyHeatmap → EngineInsights → AuctionRecommendations
- All auction-path components reskinned to Grafana dark palette — zero `bg-surface-*` or `text-content-*` tokens remain in rendered auction components
- Nominated player display refactored to use CSV `auctionValues.find()` only with derived tier badge (anchor/core/value); DOM values, FG value, external rank, and live tag all removed
- AuctionRecommendations reduced from top-50 to top-10; EngineInsights gutted to thin IdealRosterPanel wrapper

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite DraftSidebar with new section order and dark palette** - `cc990f1` (feat)
2. **Task 2: Reskin BidVerdict, IdealRosterPanel, AuctionRecommendations; simplify EngineInsights** - `bce2818` (feat)

## Files Created/Modified

- `packages/extension/components/DraftSidebar.tsx` — Redesigned auction sidebar with locked section order, Grafana dark palette, value captured header, CSV-only nominated player display, new component wiring
- `packages/extension/components/BidVerdict.tsx` — Grafana dark-mode reskin; narrator rationale and useNarratorStore removed
- `packages/extension/components/IdealRosterPanel.tsx` — Grafana dark-mode reskin; tier badges, progress bars, rank circles all converted
- `packages/extension/components/AuctionRecommendations.tsx` — slice(0, 10) top-10 list; Grafana filter buttons and background
- `packages/extension/components/EngineInsights.tsx` — Simplified to 17-line wrapper rendering only IdealRosterPanel; win probability, draft targets, nomination strategy sections removed

## Decisions Made

- Kept EngineInsights as thin wrapper rather than inlining IdealRosterPanel in DraftSidebar — preserves the ErrorBoundary sectionName structure without change
- Snake draft path intentionally left with old light-mode tokens — snake UI deferred per plan spec
- `pitcherHitterSplit` value still flows through storage write and into mobile relay even though slider is removed — engine still uses it, just no user-facing control

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in PlayerCard.tsx, entrypoints, and test files unchanged — all out-of-scope per deviation rules. None in modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 52 (all 3 plans) complete — v5.0 extension sidebar UI update fully delivered
- All new components (SignalStrip, CategoryHeatmap, PositionSupplyHeatmap, NextNominee) wired with correct props
- Grafana dark palette applied consistently across all auction-rendered components
- Extension is ready for live draft testing with the v5.0 engine signal display

---
*Phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals*
*Completed: 2026-03-16*

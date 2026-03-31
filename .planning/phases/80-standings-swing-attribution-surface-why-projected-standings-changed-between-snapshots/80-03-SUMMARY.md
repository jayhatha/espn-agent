---
phase: 80-standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots
plan: 03
subsystem: ui
tags: [react, nextjs, tailwind, dark-mode, tanstack-query]

# Dependency graph
requires:
  - phase: 80-01
    provides: StandingsSwingAttributionAgent backend logic
  - phase: 80-02
    provides: /standings/swing API endpoint and api.getStandingsSwing() client method
provides:
  - SwingAttributionPanel component (bucket bars + category breakdown table)
  - What Changed? card integrated into Projected Standings tab
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Props-only component with inline helper functions (no hooks, no use client)
    - Semantic token classes throughout (text-positive/text-negative, dark:text-shell-muted, dark:bg-shell-bg)
    - useQuery enabled guard: viewMode === "projected" && !!selectedTeamId && !!data?.snapshotDate

key-files:
  created:
    - packages/frontend/src/components/league/SwingAttributionPanel.tsx
  modified:
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx

key-decisions:
  - "SwingAttributionPanel uses named export + default export for flexibility; page imports as named"
  - "attribution_available=false or |totalDelta|<0.5 hides the panel entirely — no empty state shown"
  - "Category breakdown filtered to |rotoDelta|>0, sorted by abs desc, capped at 8 rows"

patterns-established:
  - "Swing attribution panel: always guarded by attribution_available && |totalDelta|>=0.5"
  - "Props-only attribution panel: define interfaces inline, no shared package import needed"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 80 Plan 03: Swing Attribution Panel Summary

**SwingAttributionPanel component with three bucket bars and per-category breakdown wired into Projected Standings tab via useQuery, rendering only when attribution data is available and totalDelta is significant**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T19:30:00Z
- **Completed:** 2026-03-31T19:34:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built `SwingAttributionPanel` as a props-only display component with three labeled bucket bars (Actual Performance, Projection Change, Competitor Movement) and a per-category breakdown table
- Integrated into standings/page.tsx with a dedicated `useQuery` keyed on `["standings-swing", leagueId, selectedTeamId, data?.snapshotDate]`
- Panel only renders when: projected tab active + team selected + `attribution_available=true` + `|totalDelta|>=0.5`
- TypeScript build passes without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Build SwingAttributionPanel component** - `77765a5` (feat)
2. **Task 2: Wire SwingAttributionPanel into the Projected Standings tab** - `003a7d1` (feat)

## Files Created/Modified
- `packages/frontend/src/components/league/SwingAttributionPanel.tsx` - Props-only component rendering bucket bars and category breakdown; semantic tokens only; no use client directive
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - Added import, SwingAttributionData interface, useQuery, and conditional JSX block

## Decisions Made
- Named export + default export for `SwingAttributionPanel` — named import used at call site, consistent with other league components
- `attribution_available=false` (only one snapshot exists) hides panel entirely — no empty state needed since no data to show
- Bucket row backgrounds use `dark:bg-shell-bg bg-surface-secondary` — matches existing row pattern in AtRiskSummary and marginal gains

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 80 is complete — all three plans executed (attribution agent, API endpoint, UI panel)
- The "What Changed?" feature is fully wired from backend computation to frontend display
- No blockers for future phases

## Known Stubs
None — the panel fully wires to the `/standings/swing` API endpoint. When attribution_available is false or |totalDelta| < 0.5, the panel is intentionally hidden.

---
*Phase: 80-standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots*
*Completed: 2026-03-31*

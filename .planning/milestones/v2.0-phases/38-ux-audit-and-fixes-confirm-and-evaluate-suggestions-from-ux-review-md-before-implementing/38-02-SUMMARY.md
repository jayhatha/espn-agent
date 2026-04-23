---
phase: 38-ux-audit-and-fixes
plan: 02
subsystem: ui
tags: [react, next.js, navigation, empty-states, tailwind]

# Dependency graph
requires: []
provides:
  - Two-tier hierarchical navigation with active state detection via usePathname
  - Extended ErrorAlert component with action prop (href or onClick CTA button)
  - Actionable empty states in waivers, trades, and standings pages
affects: [38-03, any phase that adds new league routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-tier navigation: primary links (large) + secondary links (small) with usePathname active state
    - ErrorAlert action prop pattern for CTA buttons in empty/error states

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
    - packages/frontend/src/components/ui/ErrorAlert.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx

key-decisions:
  - "Active route detection uses pathname === href for Overview (exact) and pathname.startsWith(href) for all others (prefix)"
  - "ErrorAlert action button uses variant-appropriate bg color (info=accent, warning=amber, error=red) for visual coherence"
  - "Standings page uses href to league overview page for Refresh Data CTA since no snapshot mutation exists on that page"

patterns-established:
  - "NavigationSection pattern: primaryLinks (3 main routes) + secondaryLinks (5 tool routes) with isActive helper"
  - "Empty state pattern: ErrorAlert variant=info + action prop instead of custom centered div with icon"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 38 Plan 02: UX Navigation and Empty States Summary

**Two-tier NavigationSection with usePathname active highlighting, plus ErrorAlert extended with CTA action prop used across waivers/trades/standings empty states**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T15:23:19Z
- **Completed:** 2026-03-10T15:26:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Refactored NavigationSection from a flat 7-link grid into two hierarchical tiers: 3 primary links (Overview, Standings, Roster Moves) with `text-body font-semibold` and 5 secondary links (Waivers, Trade Analyzer, Trends, Lineup Optimizer, Streaming Pitchers) with `text-body-sm text-content-secondary`
- Active page detection using `usePathname()` — exact match for Overview, prefix match for all others — highlights active link with `bg-accent text-content-inverse`
- Extended ErrorAlert with an `action` prop that renders as a `<Link>` (when href provided) or `<button>` (when onClick provided) styled with variant-appropriate primary CTA colors
- Updated 4 empty state locations across waivers, trades (AI suggestions), and standings (current/projected/fallback) to use `ErrorAlert variant="info"` with specific actionable CTAs

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor NavigationSection to two-tier hierarchy with active state** - `696d020` (feat)
2. **Task 2: Extend ErrorAlert with action prop and update empty states** - `7b7572e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx` - Rewritten: two-tier layout, usePathname active detection, removed flat grid
- `packages/frontend/src/components/ui/ErrorAlert.tsx` - Added action prop (href/onClick) with variant-styled CTA button
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - Empty state replaced with ErrorAlert info + Upload Projections CTA; removed unused FileText import
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` - AI suggestions empty state replaced with ErrorAlert info + Upload Projections CTA
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - Three empty state locations updated with ErrorAlert info + contextual CTA

## Decisions Made
- Active route detection uses exact match for Overview (`/leagues/${id}`) to avoid it matching all sub-routes, and prefix match for all other primary and secondary links
- ErrorAlert action button color follows variant: info uses `bg-accent` (primary blue), warning uses `bg-warning` (amber), error uses `bg-negative` (red) for visual hierarchy consistency
- Standings page "Refresh Data" CTA links to `/leagues/${leagueId}` (league overview) rather than triggering a mutation, since the standings page has no snapshot trigger available

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Navigation hierarchy and active states are in place for Phase 38-03
- ErrorAlert action prop pattern is available for any other pages that need CTA-augmented empty states
- Build passes cleanly with no TypeScript errors

---
*Phase: 38-ux-audit-and-fixes*
*Completed: 2026-03-10*

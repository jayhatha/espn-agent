---
phase: 65-dark-mode-shell
plan: 02
subsystem: ui
tags: [nextjs, layout, navigation, tanstack-query, lucide-react, dark-mode]

# Dependency graph
requires:
  - phase: 65-01
    provides: Shell color tokens (shell-bg, shell-panel, shell-border, shell-nav, shell-text, shell-muted, shell-accent) and font-mono class
provides:
  - LeagueNav: left sidebar with 9 nav items, active link detection via usePathname/useParams
  - TopBar: top bar fetching league name + season from /api/leagues/:id/status
  - SignalsPanel: right column with waiver + trade signals from localStorage team selection
  - leagues/[id]/layout.tsx: three-column dark shell wrapping all league sub-pages
  - leagues/[id]/settings/page.tsx: stub settings page avoiding 404
affects: [66-roto-math, 67-category-map, 68-faab-gs, 69-trade-finder, 70-trends]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server Component layout.tsx — no "use client" needed, just imports client components
    - LeagueNav uses LucideIcon type (not ComponentType<{size?:number}>) to avoid propTypes mismatch
    - SignalsPanel reads localStorage in useEffect (not during SSR) to avoid hydration issues

key-files:
  created:
    - packages/frontend/src/components/shell/LeagueNav.tsx
    - packages/frontend/src/components/shell/TopBar.tsx
    - packages/frontend/src/components/shell/SignalsPanel.tsx
    - packages/frontend/src/app/leagues/[id]/layout.tsx
    - packages/frontend/src/app/leagues/[id]/settings/page.tsx
  modified: []

key-decisions:
  - "layout.tsx uses pl-60 offset on main area (not margin-left) so LeagueNav fixed positioning doesn't overlap"
  - "LucideIcon type used in NavItem interface — avoids TypeScript error from Lucide's string|number size prop"
  - "SignalsPanel localStorage read deferred to useEffect to avoid SSR/hydration mismatch"

patterns-established:
  - "Shell layout pattern: fixed LeagueNav (w-60) + flex main col with TopBar + scrollable main + hidden-xl SignalsPanel"
  - "Shell data fetching: TanStack Query with staleTime=60s for league status, 5min for signals"

requirements-completed: [SHELL-02, SHELL-03, SHELL-04]

# Metrics
duration: 15min
completed: 2026-03-23
---

# Phase 65 Plan 02: Shell Layout Summary

**Three-column dark shell (LeagueNav + TopBar + SignalsPanel) wired into leagues/[id]/layout.tsx with 9-item sidebar, live league status, and contextual signals panel**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-23T18:22:00Z
- **Completed:** 2026-03-23T18:37:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created LeagueNav with 9 nav items (Dashboard through Settings), active link detection via usePathname + useParams
- Created TopBar fetching league name and season from `/api/leagues/:id/status` via TanStack Query
- Created SignalsPanel reading localStorage team selection, fetching waiver + trade recommendations, hidden on narrow screens
- Wired all three into leagues/[id]/layout.tsx as a three-column dark shell wrapping all league sub-pages
- Added settings/page.tsx stub to prevent 404 on Settings nav link

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shell components (LeagueNav, TopBar, SignalsPanel)** - `1e21372` (feat)
2. **Task 2: Create league shell layout and settings stub page** - `f0a8841` (feat)

## Files Created/Modified

- `packages/frontend/src/components/shell/LeagueNav.tsx` - 9-item sidebar nav with active link detection
- `packages/frontend/src/components/shell/TopBar.tsx` - Top bar with league name/season, FAAB/GS stubbed
- `packages/frontend/src/components/shell/SignalsPanel.tsx` - Right signals column, hidden <xl, reads localStorage
- `packages/frontend/src/app/leagues/[id]/layout.tsx` - Three-column dark shell layout
- `packages/frontend/src/app/leagues/[id]/settings/page.tsx` - Stub settings page

## Decisions Made

- `layout.tsx` uses `pl-60` offset on the main flex column (not `ml-60`) so the fixed LeagueNav doesn't overlap main content
- Used `LucideIcon` type (from lucide-react) for the icon field in `NavItem` — custom `ComponentType<{size?:number}>` caused TypeScript error because Lucide's size prop accepts `string | number`, not just `number`
- SignalsPanel reads localStorage in `useEffect` (not during render) to avoid SSR hydration mismatch on team ID

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed LucideIcon TypeScript type mismatch**
- **Found during:** Task 1 (shell components) — post-creation TypeScript check
- **Issue:** `ComponentType<{ size?: number }>` rejected Lucide icons because Lucide's `size` prop accepts `string | number` but the custom interface only allowed `number`
- **Fix:** Replaced custom interface with `LucideIcon` type imported directly from `lucide-react`
- **Files modified:** `packages/frontend/src/components/shell/LeagueNav.tsx`
- **Verification:** `npx tsc --noEmit` passed with no errors after fix
- **Committed in:** `1e21372` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type bug)
**Impact on plan:** Minor type correction, no behavior change. No scope creep.

## Issues Encountered

None beyond the Lucide type fix documented above.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All created files confirmed on disk. Task commits 1e21372 and f0a8841 confirmed in git log.

## Next Phase Readiness

- Three-column dark shell is live on all `/leagues/[id]/` routes
- All subsequent phases (66-70) can render content into the shell's `<main>` area via their own page.tsx files
- TopBar has TODO comments for FAAB and GS Pace wiring (Phase 68 will fill these in)
- SignalsPanel has TODO potential: currently reads 3 waiver + 2 trade signals; Phase 67/69 may expand the signal types

---
*Phase: 65-dark-mode-shell*
*Completed: 2026-03-23*

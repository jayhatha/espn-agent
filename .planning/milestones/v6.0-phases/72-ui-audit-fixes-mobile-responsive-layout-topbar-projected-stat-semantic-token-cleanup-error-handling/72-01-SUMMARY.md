---
phase: 72-ui-audit-fixes
plan: "01"
subsystem: frontend/shell
tags: [mobile, responsive, ux, dark-mode, error-handling, semantic-tokens]
dependency_graph:
  requires: []
  provides:
    - Mobile-responsive league shell layout (375px viewport)
    - TopBar projected rank wired to /standings/projected API
    - Inline error handling for waiver evaluation
  affects:
    - packages/frontend/src/app/leagues/[id]/layout.tsx
    - packages/frontend/src/components/shell/LeagueNav.tsx
    - packages/frontend/src/components/shell/TopBar.tsx
    - packages/frontend/src/components/shell/SignalsPanel.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
tech_stack:
  added: []
  patterns:
    - Mobile hamburger nav overlay with mobileOpen state and backdrop
    - useQuery + useMemo for TopBar projected rank from /standings/projected
    - isLoadingSignals derived state from dual useQuery isLoading flags
    - ErrorAlert inline error with onRetry handler replacing alert()
    - dark: modifier classes for amber warning styles in dark mode
    - bg-shell-accent semantic token for tab active state
    - text-caption semantic token replacing text-[11px] arbitrary size
key_files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/layout.tsx
    - packages/frontend/src/components/shell/LeagueNav.tsx
    - packages/frontend/src/components/shell/TopBar.tsx
    - packages/frontend/src/components/shell/SignalsPanel.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
decisions:
  - mobileOpen state lives in LeagueNav component (not layout) — nav owns its own open/close state
  - backdrop div renders only when mobileOpen is true (conditional render, not CSS visibility) — avoids persistent DOM element
  - isLoadingSignals uses && !!teamId guard — prevents "loading" state when no team selected (would never resolve)
  - projectedValue useMemo computes in TopBar — avoids re-computing on every render without dependency change
metrics:
  duration: "~12 min"
  completed_date: "2026-03-25T00:46:19Z"
  tasks_completed: 3
  files_modified: 5
---

# Phase 72 Plan 01: UI Audit Fixes Summary

Mobile-responsive shell layout with hamburger nav, wired TopBar projected rank from `/standings/projected` API, and inline ErrorAlert replacing `alert()` on waivers page with full dark mode and semantic token fixes.

## Tasks Completed

### Task 1: Fix mobile responsive layout

**Commits:** 76fb7b9

**layout.tsx:** Changed `pl-60` to `pl-0 md:pl-60` on the main content wrapper div — mobile viewport no longer has a 240px sidebar offset pushing content off-screen.

**LeagueNav.tsx:**
- Added `Menu` and `X` imports from `lucide-react`
- Added `mobileOpen` state (`useState(false)`)
- Changed nav element to use `{mobileOpen ? "flex" : "hidden"} md:flex` — hidden on mobile by default, conditionally shown via hamburger
- Added fixed hamburger toggle button (`md:hidden`) that toggles `mobileOpen`
- Added backdrop overlay div (`bg-black/50 md:hidden`) that closes nav on click
- Added `onClick={() => setMobileOpen(false)}` to each nav Link — closes overlay on navigation

### Task 2: Wire TopBar projected stat and fix SignalsPanel empty state copy

**Commits:** 9dbf86b

**TopBar.tsx:**
- Added `useMemo` to React imports
- Added `ProjectedStandingsResponse` interface
- Added `useQuery` for `api.getProjectedStandings(leagueId)` with 5-min staleTime, enabled when `!!id && !!teamId`
- Added `projectedValue` useMemo that finds the selected team in `overallStandings` and formats `#${rank}` or `"--"`
- Changed Projected StatItem from hardcoded `value="--"` to `value={projectedValue}`

**SignalsPanel.tsx:**
- Destructured `isLoading: waiverLoading` from waiver query
- Destructured `isLoading: tradeLoading` from trade query
- Added `isLoadingSignals = (waiverLoading || tradeLoading) && !!teamId` derived state
- Changed empty state copy from hardcoded `"Loading signals..."` to conditional: `{isLoadingSignals ? "Loading signals..." : "No signals at the moment"}`

### Task 3: Fix all waivers/page.tsx audit findings

**Commits:** f3cd310

- **Replaced `alert()`**: Added `evaluationError` state (`useState<string | null>(null)`), clear it at start of `handleEvaluate`, replace `alert()` in catch block with `setEvaluationError()`
- **Added inline ErrorAlert**: Below the Evaluate button, renders `<ErrorAlert message={evaluationError} variant="error" onRetry={...} />` when `evaluationError` is set
- **Legality warning dark mode**: Added `dark:bg-amber-900/20`, `dark:border-amber-800`, `dark:text-amber-400` to warning container, heading, and list
- **Tab active state**: Changed `bg-accent` to `bg-shell-accent` on both AI Picks and Manual Eval buttons
- **Arbitrary text sizes**: Replaced both `text-[11px]` instances in `renderSwapVisualization` with `text-caption`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all changes are wired to real API endpoints or real UI logic.

## Self-Check

**Files created/modified:**

- [ ] packages/frontend/src/app/leagues/[id]/layout.tsx — verified `md:pl-60`
- [ ] packages/frontend/src/components/shell/LeagueNav.tsx — verified `md:hidden` button, `useState(false)`, `setMobileOpen(false)` in Links, `bg-black/50` backdrop
- [ ] packages/frontend/src/components/shell/TopBar.tsx — verified `getProjectedStandings`, `projected_overall_rank`, `value={projectedValue}`, `useMemo`
- [ ] packages/frontend/src/components/shell/SignalsPanel.tsx — verified `isLoadingSignals`, `"No signals at the moment"`
- [ ] packages/frontend/src/app/leagues/[id]/waivers/page.tsx — verified 0 `alert()`, `evaluationError` state, `<ErrorAlert`, `dark:bg-amber-900/20`, `bg-shell-accent`, 0 `text-[11px]`

**Commits exist:**

- 76fb7b9 — feat(72-01): fix mobile responsive layout with hamburger nav
- 9dbf86b — feat(72-01): wire TopBar projected rank from API and fix SignalsPanel empty state
- f3cd310 — fix(72-01): fix all waivers page audit findings

**TypeScript:** `npx tsc --noEmit` passed with zero errors.

## Self-Check: PASSED

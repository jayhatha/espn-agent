---
phase: 65-dark-mode-shell
plan: 04
subsystem: ui
tags: [dark-mode, tailwindcss, pages, sections, league-dashboard]

# Dependency graph
requires: [65-01]
provides:
  - Zero unguarded bg-white/bg-surface-secondary/bg-surface-tertiary classes in all 17 page/section files under leagues/[id]/
  - All page-level cards, tables, section backgrounds have dark: shell token overrides
  - All border-neutral-* and divide-neutral-* classes have dark:border-shell-border / dark:divide-shell-border
  - All hover states (hover:bg-surface-secondary) have dark:hover:bg-shell-bg overrides
affects: [65-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline dark: class pattern: bg-white dark:bg-shell-panel, bg-surface-secondary dark:bg-shell-bg, etc."
    - "Table dark pattern: thead bg-surface-secondary dark:bg-shell-bg, tbody bg-white dark:bg-shell-panel, divide/border-neutral dark:divide-shell-border"
    - "Select/input dark pattern: bg-white dark:bg-shell-bg border-neutral-300 dark:border-shell-border text-content dark:text-shell-text"

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/moves/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/page.tsx
    - packages/frontend/src/app/leagues/[id]/projections/page.tsx
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/validate/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx

key-decisions:
  - "bg-white dark:bg-shell-panel for card/modal surfaces, bg-surface-secondary dark:bg-shell-bg for table headers and secondary areas"
  - "select/input elements get dark:bg-shell-bg (slightly darker than panel) to distinguish inputs from card backgrounds"
  - "shadow-card dark:shadow-none — shadows are invisible on dark backgrounds so removed for clean dark UI"

requirements-completed: [SHELL-06]

# Metrics
duration: 10min
completed: 2026-03-23
---

# Phase 65 Plan 04: Dark Mode Page-Level Overrides Summary

**dark: Tailwind variant overrides applied to all 17 page and section files under leagues/[id]/ — zero light-mode-only surface classes remain**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-23T18:36:31Z
- **Completed:** 2026-03-23T18:46:34Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Applied dark: overrides to all 6 section files (ActionsSection, CategoryTableSection, StatsSection, RosterSection, IdentitySection, NavigationSection)
- Applied dark: overrides to moves/page.tsx: filter bar card, summary cards, tab navigation, leaderboard table, draft report table/cards, trades tab trade cards, all border dividers
- Applied dark: overrides to trades/page.tsx: partner select, roster picker borders, impact summary card, inner analysis card, category breakdown table
- Applied dark: overrides to standings/page.tsx: thead, sticky th, tbody, hover rows, tab divider
- Applied dark: overrides to waivers/page.tsx: mode switcher, category impact table, FA/roster picker containers, dividers, waiver recommendation cards
- Applied dark: overrides to page.tsx (dashboard): auth modal bg-white
- Applied dark: overrides to projections/page.tsx: drag-drop upload area bg-surface-secondary
- Applied dark: overrides to trends/page.tsx: two tab container cards, season select, category select, filter row border
- Applied dark: overrides to streaming/page.tsx: lookahead toggle bar, empty state icon bg
- Applied dark: overrides to draft/auction/page.tsx: position select, link buttons, valuations table container, thead, tbody, meta footer
- Applied dark: overrides to draft/auction/validate/page.tsx: two selects, link button, comparison table, expanded projection rows, stat cards, summary footer
- Applied dark: overrides to draft/rankings/page.tsx: position select, link button, rankings table container, thead, tbody, meta footer

## Verification Results

- `grep -rn "bg-white|bg-surface" leagues/[id]/ | grep -v "dark:"` returns 0
- `grep -rl "dark:" leagues/[id]/` returns 17 (all page/section files)
- `npx tsc --noEmit` passes with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dark overrides to moves, trades, standings, waivers, and all 6 section files** - `a6cc067` (feat)
2. **Task 2: Add dark overrides to dashboard, projections, trends, streaming, and draft pages** - `acd64ce` (feat)

## Decisions Made

- Card backgrounds use `dark:bg-shell-panel` (#111318), secondary/header areas use `dark:bg-shell-bg` (#0B0D10) to maintain visual hierarchy
- Select/input fields use `dark:bg-shell-bg` to appear slightly darker than card panels, distinguishing interactive from non-interactive
- `shadow-card dark:shadow-none` — card shadows provide no visual value on dark backgrounds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

All 17 modified files verified to exist on disk. Both task commits (a6cc067, acd64ce) confirmed in git log.

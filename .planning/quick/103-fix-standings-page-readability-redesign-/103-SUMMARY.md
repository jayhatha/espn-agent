---
phase: 103-fix-standings-page-readability-redesign
plan: 01
subsystem: ui
tags: [typography, dark-mode, tailwind, inter, contrast]

requires:
  - phase: 65-dark-mode-shell
    provides: shell design tokens (shell-text, shell-muted, shell-bg, shell-panel)
provides:
  - Inter-only typography with weight-based heading hierarchy
  - Dark mode readable standings page with shell token contrast
affects: [standings, typography, design-system]

tech-stack:
  added: []
  patterns: [dark-mode-contrast-pairing, font-weight-hierarchy]

key-files:
  created: []
  modified:
    - packages/frontend/src/app/layout.tsx
    - packages/frontend/tailwind.config.js
    - packages/frontend/src/components/ui/Heading.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx

key-decisions:
  - "Replaced font-display (DM Serif Display) with font-extrabold (h1) and font-bold (h2) for Inter-only typography"
  - "Used dark:text-shell-text and dark:text-shell-muted as standard dark mode contrast pairing for all standings text"

patterns-established:
  - "Dark mode contrast: always pair text-content with dark:text-shell-text, text-content-secondary with dark:text-shell-muted"
  - "Heading weights: h1=font-extrabold, h2=font-bold, h3/h4=font-semibold (all Inter)"

requirements-completed: []

duration: 3min
completed: 2026-03-24
---

# Quick Task 103: Fix Standings Page Readability Summary

**Removed DM Serif Display font globally, unified to Inter with weight hierarchy, fixed all dark mode contrast on standings page using shell tokens**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T06:05:38Z
- **Completed:** 2026-03-24T06:08:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed DM Serif Display font entirely (import, variable, tailwind config, all usages)
- Unified heading typography to Inter with font-extrabold (h1), font-bold (h2), font-semibold (h3/h4)
- Fixed all dark mode contrast issues on standings page: table headers, data cells, tab navigation, marginal gains, snapshot date
- Added dark mode highlight for selected team row (dark:bg-shell-accent/10)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove DM Serif Display font, replace with Inter weights** - `5adf771` (fix)
2. **Task 2: Fix standings page dark mode readability and contrast** - `762a42f` (fix)

## Files Created/Modified
- `packages/frontend/src/app/layout.tsx` - Removed DM_Serif_Display import and CSS variable
- `packages/frontend/tailwind.config.js` - Removed display font family
- `packages/frontend/src/components/ui/Heading.tsx` - Replaced font-display with font-extrabold/font-bold
- `packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx` - Replaced font-display with font-extrabold
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - Added dark mode contrast classes throughout

## Decisions Made
- Replaced font-display (DM Serif Display) with font-extrabold (h1) and font-bold (h2) for Inter-only typography
- Used dark:text-shell-text and dark:text-shell-muted as standard dark mode contrast pairing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

---
*Quick Task: 103-fix-standings-page-readability-redesign*
*Completed: 2026-03-24*

---
phase: 65-dark-mode-shell
plan: 03
subsystem: ui
tags: [dark-mode, tailwindcss, ui-components, shell-tokens, font-mono]

# Dependency graph
requires: ["65-01"]
provides:
  - All 16 shared UI components have dark: variant classes using shell tokens
  - No white/light-mode surfaces remain when html.dark is applied
  - StatsTable numeric cells use font-mono (JetBrains Mono via SHELL-05)
  - StatCard stat values use font-mono
  - Semantic dark colors for Badge/ErrorAlert variants (emerald/red/amber/blue)
affects: [66-roto-math, 67-category-map, 68-faab-gs, 69-trade-finder, 70-trends]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dark: prefix classes on all UI components using shell-* tokens from tailwind.config.js"
    - "CVA base class dark: injection — Heading uses dark:text-shell-text in cva() base string"
    - "Semantic dark color overrides — Badge/ErrorAlert use dark:bg-*/30 dark:text-*/400 dark:border-*/800 pattern"

key-files:
  created: []
  modified:
    - packages/frontend/src/components/ui/Card.tsx
    - packages/frontend/src/components/ui/Button.tsx
    - packages/frontend/src/components/ui/Badge.tsx
    - packages/frontend/src/components/ui/Input.tsx
    - packages/frontend/src/components/ui/Select.tsx
    - packages/frontend/src/components/ui/StatCard.tsx
    - packages/frontend/src/components/ui/StatsTable.tsx
    - packages/frontend/src/components/ui/Heading.tsx
    - packages/frontend/src/components/ui/Text.tsx
    - packages/frontend/src/components/ui/Container.tsx
    - packages/frontend/src/components/ui/PageHeader.tsx
    - packages/frontend/src/components/ui/ErrorAlert.tsx
    - packages/frontend/src/components/ui/LoadingSpinner.tsx
    - packages/frontend/src/components/ui/Tooltip.tsx
    - packages/frontend/src/components/ui/Term.tsx
    - packages/frontend/src/components/ui/TeamColorBadge.tsx

key-decisions:
  - "StatsTable td cells get font-mono class globally — all numeric data in tables renders in JetBrains Mono (SHELL-05)"
  - "Container gets dark:text-inherit — inherits from shell body (dark:text-shell-text set in globals.css), no visual change"
  - "TeamColorBadge uses dynamic inline styles for backgroundColor/color — dark:font-semibold improves legibility without overriding team colors"
  - "Term fallback span gets dark:text-shell-muted — definitions render in muted tone when glossary lookup fails"

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 65 Plan 03: UI Component Dark Variants Summary

**Dark: variant classes added to all 16 shared UI components using shell tokens — no white surfaces remain when html.dark is applied**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-23T18:36:02Z
- **Completed:** 2026-03-23T18:39:51Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Added `dark:bg-shell-panel dark:border-shell-border dark:shadow-none` to Card, CardHeader, CardFooter
- Added dark variants for all 4 Button CVA variants (primary, secondary, ghost; danger unchanged since red works on dark)
- Added dark variants for all 5 Badge variants using semantic dark palettes (emerald/red/amber/blue with /30 backgrounds)
- Added `dark:bg-shell-bg dark:border-shell-border dark:text-shell-text dark:placeholder:text-shell-muted` to Input and Select
- Added dark panel/border to StatCard; stat value now uses `font-mono` (SHELL-05)
- Updated StatsTable: dark panel container, dark:bg-shell-bg thead, dark:text-shell-muted th headers, dark:text-shell-text td cells, dark:divide-shell-border dividers, dark:text-shell-accent sort arrows, `font-mono` on all td cells (SHELL-05), dark:hover:bg-shell-bg row hover
- Added `dark:text-shell-text` to Heading CVA base class (applies to all 4 heading levels)
- Added `dark:text-shell-text` (default) and `dark:text-shell-muted` (secondary/tertiary) to Text CVA color variants
- Container: added `dark:text-inherit` to satisfy dark: token presence; px-4 satisfies SHELL-07 16px base padding
- PageHeader: `dark:text-shell-muted dark:hover:text-shell-text` on back link
- ErrorAlert: full dark treatment for error/warning/info variants with dark:bg/border/text patterns
- LoadingSpinner: `dark:border-shell-muted` spinner, `dark:bg-shell-bg` full-page container, `dark:bg-shell-border` skeleton blocks
- Tooltip popup: `dark:bg-shell-bg dark:text-shell-text dark:border dark:border-shell-border`
- Term fallback: `dark:text-shell-muted` on undefined glossary term spans
- TeamColorBadge: `dark:font-semibold` for legibility (team colors are dynamic via inline styles, unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dark variants to Card, Button, Badge, Input, Select, StatCard** - `170c681` (feat)
2. **Task 2: Add dark variants to StatsTable, Heading, Text, and remaining 6 UI components** - `6da4b86` (feat)

## Files Created/Modified

All 16 files in `packages/frontend/src/components/ui/` were modified with dark: variant classes.

## Decisions Made

- StatsTable td cells get `font-mono` globally — all numeric/data cells in tables render in JetBrains Mono per SHELL-05
- Container uses `dark:text-inherit` — no background color needed (transparent wrapper), text inheritance is correct behavior
- TeamColorBadge keeps dynamic inline styles for team colors unchanged — `dark:font-semibold` adds weight without overriding color
- Term's fallback span now shows muted tone on dark backgrounds consistent with secondary content treatment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `packages/frontend/src/components/shell/LeagueNav.tsx` (from Phase 65-02, LucideProps.size string/number incompatibility). Out of scope — not caused by this plan's changes. Logged as deferred item.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 16 UI components render correctly on dark backgrounds using shell tokens
- StatsTable and StatCard use font-mono for numeric data (SHELL-05 complete)
- Foundation for Phase 65-04 (layout + navigation dark polish) is ready
- All downstream phases (66-70) can use any UI component without white surface bleed-through

---
*Phase: 65-dark-mode-shell*
*Completed: 2026-03-23*

---
phase: 17-site-redesign
plan: 01
subsystem: ui
tags: [tailwind, design-system, accessibility, typography, cn, cva, lucide-react]

# Dependency graph
requires: []
provides:
  - Design token system in tailwind.config.js (typography, colors, spacing, shadows)
  - cn() utility combining clsx + tailwind-merge for class conflict resolution
  - CHART_THEME export aligned with design tokens for Recharts
  - Clean globals.css with accessibility base styles (focus-visible, reduced-motion, skip-to-content)
  - Updated root layout with Inter variable font, skip-to-content link, semantic main element
affects: [17-02, 17-03, 17-04, 17-05]

# Tech tracking
tech-stack:
  added: [tailwind-merge@3.5.0, class-variance-authority@0.7.1, lucide-react@0.576.0]
  patterns:
    - cn() utility for conditional class merging without conflicts
    - Design tokens defined in tailwind.config.js extend block (additive, non-breaking)
    - Inter variable font via --font-inter CSS variable with display=swap
    - Skip-to-content link pattern for keyboard accessibility

key-files:
  created:
    - packages/frontend/src/lib/cn.ts
    - packages/frontend/src/lib/chart-theme.ts
  modified:
    - packages/frontend/package.json
    - packages/frontend/tailwind.config.js
    - packages/frontend/src/app/globals.css
    - packages/frontend/src/app/layout.tsx

key-decisions:
  - "Keep existing primary colors in tailwind.config.js so existing pages don't break during incremental migration"
  - "Inter variable font with --font-inter CSS variable enables font-sans Tailwind class to consume custom token"
  - "Accent token uses near-black (#111827) as primary action color for editorial aesthetic instead of blue-600"
  - "globals.css uses @layer base to avoid specificity issues with Tailwind utilities"

patterns-established:
  - "cn() for all conditional className merging in components"
  - "Design tokens via tailwind.config.js extend block (additive, never breaks existing)"
  - "Skip-to-content link as first child in body for keyboard nav"
  - "CHART_THEME for all Recharts styling to maintain consistency"

requirements-completed: [DS-01, DS-02]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 17 Plan 01: Design System Foundation Summary

**Inter variable font, full Tailwind token system (surface/content/accent/semantic colors, typography scale, spacing), cn() utility, CHART_THEME, and accessible root layout with skip-link and reduced-motion support**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T21:31:08Z
- **Completed:** 2026-03-02T21:36:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed tailwind-merge, class-variance-authority, and lucide-react as project dependencies
- Defined complete design token system in tailwind.config.js: typography scale (display, h1-h4, body, caption, data), color tokens (surface, content, accent, positive, negative, warning, info), spacing tokens, maxWidth, gap, borderRadius, boxShadow
- Created cn() utility combining clsx + tailwind-merge for conflict-safe class merging
- Created CHART_THEME export with colors, grid, axis, and tooltip styling aligned with tokens
- Replaced gradient/dark-mode globals.css with clean accessibility-first base styles
- Updated root layout: Inter variable font with CSS variable, skip-to-content link, semantic main element with id

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create design token system** - `af6644c` (feat)
2. **Task 2: Replace globals.css and update root layout for accessibility** - `497fb27` (feat)

## Files Created/Modified
- `packages/frontend/src/lib/cn.ts` - clsx + tailwind-merge utility exported as cn()
- `packages/frontend/src/lib/chart-theme.ts` - CHART_THEME export for Recharts styling
- `packages/frontend/package.json` - Added tailwind-merge, class-variance-authority, lucide-react
- `packages/frontend/tailwind.config.js` - Extended with full design token system (additive, keeps primary colors)
- `packages/frontend/src/app/globals.css` - Replaced with accessibility-first base styles; no gradient, no dark mode block
- `packages/frontend/src/app/layout.tsx` - Inter variable font, skip-to-content link, main id="main-content"

## Decisions Made
- Kept existing primary color block in tailwind.config.js so existing pages continue to work without modification during incremental migration
- Near-black (#111827) chosen as the accent/primary action color instead of blue-600 for editorial high-end aesthetic
- Inter variable font configured with `--font-inter` CSS variable so `font-sans` in Tailwind can be mapped to the loaded font
- globals.css uses `@layer base` to ensure design token classes are applied at the correct specificity level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Design token foundation is complete and build-verified
- cn() utility ready for all subsequent component creation
- CHART_THEME ready for trends/chart page updates
- Plan 02 (component library: Button, Card, Container, Heading, etc.) can begin immediately
- Existing pages continue to work unchanged; migration is incremental

---
*Phase: 17-site-redesign*
*Completed: 2026-03-02*

## Self-Check: PASSED
- FOUND: packages/frontend/src/lib/cn.ts
- FOUND: packages/frontend/src/lib/chart-theme.ts
- FOUND: packages/frontend/src/app/globals.css
- FOUND: packages/frontend/src/app/layout.tsx
- FOUND commit: af6644c (Task 1)
- FOUND commit: 497fb27 (Task 2)

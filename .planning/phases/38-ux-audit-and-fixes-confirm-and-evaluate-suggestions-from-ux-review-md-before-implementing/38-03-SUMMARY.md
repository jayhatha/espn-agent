---
phase: 38-ux-audit-and-fixes
plan: "03"
subsystem: ui
tags: [tooltip, glossary, waiver-grouping, design-tokens, tailwind, shared-package]

requires: []
provides:
  - GLOSSARY map in shared package with 14 analytical term definitions
  - Tooltip CSS-only hover component in frontend ui/
  - Term convenience wrapper for glossary lookup with tooltip
  - Waiver recommendations grouped by top impact category
  - body-xs font token in extension Tailwind config
  - text-muted-foreground replaced with text-content-secondary
affects:
  - extension (body-xs now resolves to 11px CSS)
  - frontend/waivers (grouped layout instead of flat paginated list)
  - frontend/standings (roto-points term tooltipped in table header)

tech-stack:
  added: []
  patterns:
    - "Tooltip: CSS-only group-hover pattern, no JS state needed"
    - "Term: glossary ID lookup wrapping Tooltip for self-documenting analytical terms"
    - "Waiver grouping: groupByTopCategory() function derives category sections from categoryImpacts array"

key-files:
  created:
    - packages/shared/src/glossary.ts
    - packages/frontend/src/components/ui/Tooltip.tsx
    - packages/frontend/src/components/ui/Term.tsx
  modified:
    - packages/shared/src/index.ts
    - packages/frontend/package.json
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/extension/tailwind.config.js

key-decisions:
  - "Used CSS group-hover for Tooltip (no useState, no portal, no JS) — simpler and works without JS hydration issues in Next.js"
  - "Grouped waivers by top impact category using deltaPoints threshold of 0.3 to filter noise, with Best Overall fallback"
  - "Removed pagination from waiver AI view — grouping provides visual structure, pagination was redundant"
  - "body-xs set to 0.6875rem (11px) to sit between caption (12px) and minimum readable text"

patterns-established:
  - "Term pattern: import { Term } from '@/components/ui/Term'; use <Term id='sgp'>SGP</Term> to annotate any analytical label"
  - "Glossary keys use kebab-case for multi-word terms (roto-points, max-bid) and lowercase for single words (sgp, era)"

requirements-completed: []

duration: 8min
completed: 2026-03-10
---

# Phase 38 Plan 03: Waiver Grouping, Tooltip Glossary, and Design Token Fixes Summary

**CSS-only Tooltip/Term component pair backed by shared glossary, waiver recommendations grouped by top impact category, and body-xs/muted-foreground design token gaps fixed across frontend and extension**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-10T15:21:00Z
- **Completed:** 2026-03-10T15:29:14Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 14-term GLOSSARY in `@espn-fantasy/shared` covering all major analytical terms (SGP, VBD, roto-points, era, whip, ops, inflation, surplus-value, max-bid, win-probability, budget-pressure, scarcity-index, expected-market-price, shapley-impact)
- Built CSS-only Tooltip component and Term convenience wrapper; applied to standings page category breakdown Total header and waivers page Projected Gain label
- Replaced flat paginated waiver recommendation list with grouped layout using `groupByTopCategory()` — recs sorted by highest deltaPoints category, Best Overall fallback for recs without dominant impact
- Fixed `text-muted-foreground` → `text-content-secondary` in waivers page (silent CSS failure)
- Added `body-xs` (0.6875rem/11px) font token to extension tailwind.config.js, resolving 64 class usages producing no CSS

## Task Commits

Each task was committed atomically:

1. **Task 1: Create glossary, Tooltip, and Term components** - `94c63ff` (feat)
2. **Task 2: Group waiver recommendations by impact category and fix design tokens** - `4eaa6b5` (feat)

## Files Created/Modified
- `packages/shared/src/glossary.ts` - GLOSSARY Record<string, string> with 14 analytical term plain-language definitions
- `packages/shared/src/index.ts` - Added GLOSSARY export
- `packages/frontend/package.json` - Added @espn-fantasy/shared workspace dependency
- `packages/frontend/src/components/ui/Tooltip.tsx` - CSS group-hover tooltip wrapping children with dotted underline and hover panel
- `packages/frontend/src/components/ui/Term.tsx` - Glossary ID lookup convenience component wrapping Tooltip
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - Added Term import; wrapped Total column header with Term id="roto-points"
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - Added groupByTopCategory function, grouped rendering replacing paginated flat list, Term on Projected Gain label, text-muted-foreground fix
- `packages/extension/tailwind.config.js` - Added body-xs token at 0.6875rem/1.4 line-height

## Decisions Made
- Used CSS `group/tooltip` hover pattern for Tooltip instead of React state — no hydration concerns in Next.js App Router, no JS required
- Set deltaPoints threshold at 0.3 for grouping filter — below this, a category impact is noise not signal
- Removed pagination from AI waiver view when switching to grouped layout — grouping provides sufficient visual hierarchy without artificial page breaks
- Set body-xs to 11px (0.6875rem) — one step below caption (12px), above minimum readable threshold

## Deviations from Plan

None - plan executed exactly as written. The `labelNode` approach considered for StatsTable was correctly avoided in favor of inline JSX where we have direct template control.

## Issues Encountered
- StatsTable component's `label` field is `string` type, not `ReactNode` — used Term in JSX-controlled table headers instead (category breakdown `<th>` element). No fix needed; correct approach used from the start.

## Next Phase Readiness
- Tooltip/Term pattern ready to be applied to more analytical terms incrementally (SGP in extension sidebar, VBD in draft board, etc.)
- Waiver grouping provides better UX for scanability — groups will populate meaningfully once real waiver data flows through
- body-xs token fix means extension UI text at smallest sizes now renders correctly

## Self-Check: PASSED

All files verified present:
- packages/shared/src/glossary.ts - FOUND
- packages/frontend/src/components/ui/Tooltip.tsx - FOUND
- packages/frontend/src/components/ui/Term.tsx - FOUND
- Commit 94c63ff - FOUND
- Commit 4eaa6b5 - FOUND

---
*Phase: 38-ux-audit-and-fixes*
*Completed: 2026-03-10*

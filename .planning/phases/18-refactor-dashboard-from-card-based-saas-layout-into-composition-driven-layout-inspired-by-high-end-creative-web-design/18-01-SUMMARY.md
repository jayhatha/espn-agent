---
phase: 18-refactor-dashboard-from-card-based-saas-layout-into-composition-driven-layout-inspired-by-high-end-creative-web-design
plan: 01
subsystem: ui

tags: [next.js, tailwind, react, typography, design-system, dm-serif-display, inter]

# Dependency graph
requires:
  - phase: 17-site-redesign
    provides: Design tokens (surface/content/accent), Container, Card, Heading, Button components
provides:
  - DM Serif Display font via next/font/google with --font-display CSS variable
  - font-display Tailwind utility mapped to serif family
  - Heading component using DM Serif Display for levels 1-2, Inter for levels 3-4
  - 6 named section components in _sections/ directory
  - Section-based alternating backgrounds (bg-white / bg-surface-secondary / bg-surface-tertiary)
  - Editorial identity section with team name at display scale, rank/points as oversized numerals
affects: [phase 18 subsequent plans, all UI referencing Heading level 1-2, dashboard layout]

# Tech tracking
tech-stack:
  added: [DM_Serif_Display (next/font/google), --font-display CSS variable, font-display Tailwind utility]
  patterns:
    - Section-based compositional layout (each section is full-width with own background + internal Container)
    - Serif font opt-in via font-display class (body stays Inter/font-sans)
    - Orchestrator page pattern (data/state in page.tsx, rendering delegated to section components)

key-files:
  created:
    - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
  modified:
    - packages/frontend/src/app/layout.tsx
    - packages/frontend/tailwind.config.js
    - packages/frontend/src/components/ui/Heading.tsx
    - packages/frontend/src/app/leagues/[id]/page.tsx

key-decisions:
  - "DM Serif Display weight 400 only — bold appearance comes from the serif design itself, not font-weight forcing semibold"
  - "Heading levels 1-2 use font-display serif; levels 3-4 remain font-semibold sans — removes top-level font-semibold from CVA base"
  - "Sections manage their own Container internally — no outer Container wrapper in page.tsx — enables section background alternation"
  - "Card kept only for CategoryMiniChart (chart needs a contained surface); removed from all other locations"
  - "KPI StatCards (Total Snapshots, Latest Snapshot, Status) deleted entirely per plan"
  - "Quick actions rendered as compact text links on bg-surface-tertiary, not bordered card grid"
  - "Auth modal stays in page.tsx as fixed overlay (not a section) — correct architectural boundary"
  - "Asymmetric 8/4 col grid (lg:col-span-8 + lg:col-span-4) for TeamHealthOverview + mini chart replaces equal 2/3 + 1/3 grid"

patterns-established:
  - "Section component pattern: <section className='bg-[token] py-N'><Container size='wide'>...</Container></section>"
  - "Editorial numerals: text-h1 font-display leading-none with text-h3 font-sans suffix for denominator"
  - "Compact link strip: grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 with hover:bg-accent-light links"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 18 Plan 01: Dashboard Compositional Layout Summary

**DM Serif Display editorial typography + dashboard decomposed into 6 section components with alternating backgrounds, asymmetric grids, and KPI StatCards removed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T18:18:18Z
- **Completed:** 2026-03-03T18:22:23Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Installed DM Serif Display via next/font/google, wired --font-display CSS variable, added font-display Tailwind utility — Heading levels 1-2 now render in editorial serif
- Decomposed 965-line monolithic dashboard page into 6 named section components in `_sections/` directory, each managing its own background and Container
- Removed all Card wrappers from identity, actions, category table, quick actions, and roster sections; eliminated KPI stat cards entirely; kept Card only for the mini chart

## Task Commits

Each task was committed atomically:

1. **Task 1: Install DM Serif Display and configure typography foundation** - `38c6492` (feat)
2. **Task 2: Decompose dashboard into section components with compositional layout** - `6675e1a` (feat)

## Files Created/Modified

- `packages/frontend/src/app/layout.tsx` - Added DM_Serif_Display font with --font-display variable alongside Inter
- `packages/frontend/tailwind.config.js` - Added fontFamily.display mapping to var(--font-display)
- `packages/frontend/src/components/ui/Heading.tsx` - Levels 1-2 use font-display serif; levels 3-4 font-semibold sans
- `packages/frontend/src/app/leagues/[id]/page.tsx` - Orchestrator: data/state only, delegates rendering to 6 sections
- `packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx` - Editorial identity: team name at display scale, rank/points as oversized numerals, team selector as CTA
- `packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx` - Recommended actions on bg-surface-secondary, no Card
- `packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx` - Asymmetric 8/4 grid: TeamHealthOverview + mini chart (Card kept for chart only)
- `packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx` - Category table on bg-surface-secondary with overflow-x-auto
- `packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx` - Compact link strip on bg-surface-tertiary with 9 quick links
- `packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx` - Roster tables on bg-white, no Card wrapper

## Decisions Made

- DM Serif Display weight 400 only (the font has no other weights) — bold appearance is intrinsic to the serif letterforms, forcing semibold would break the design
- Removed top-level `font-semibold` from Heading CVA base class — it was overriding the serif weight on levels 1-2 and is now explicit per-level
- Sections own their Container internally, page.tsx has no outer Container — this is what enables full-width section background alternation
- Card kept only for CategoryMiniChart — charts need a contained surface for visual context; all other sections use section background alone
- Quick access rendered as a compact link strip (not a bordered card grid) — 9 links fit in a 5-column grid on desktop, plain hover styling

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Typography foundation ready: DM Serif Display configured, font-display utility available across all components
- Section-based layout established: pattern is documented and reusable for subsequent dashboard improvements
- All existing functionality preserved: team selector localStorage, auth modal, snapshot trigger, degraded warning
- Plan 02 can now tighten typography within sections without structural changes

---
*Phase: 18-refactor-dashboard-from-card-based-saas-layout-into-composition-driven-layout-inspired-by-high-end-creative-web-design*
*Completed: 2026-03-03*

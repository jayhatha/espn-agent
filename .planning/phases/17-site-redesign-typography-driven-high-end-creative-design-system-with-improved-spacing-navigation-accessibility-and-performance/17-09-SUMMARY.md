---
phase: 17-site-redesign
plan: 09
subsystem: ui
tags: [tailwind, design-system, accessibility, anti-patterns, cleanup]

# Dependency graph
requires:
  - phase: 17-04
    provides: Design tokens, Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn components
  - phase: 17-05
    provides: Navigation, landing page, auth pages migrated
  - phase: 17-06
    provides: Trades, waivers, standings pages migrated
  - phase: 17-07
    provides: Trends, moves, projections pages migrated with CHART_THEME
  - phase: 17-08
    provides: Admin, auction-validation, and remaining pages migrated
provides:
  - Legacy primary color block removed from tailwind.config.js
  - Zero anti-patterns across all frontend page/component files
  - Build verified passing with zero TypeScript errors
  - Anti-pattern audit documented (gradients, heavy shadows, hardcoded wrappers, old color classes)
affects: [future-frontend-phases, design-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "max-w-content-wide replaces max-w-7xl in navigation to use design token"
    - "hover:shadow-card-hover replaces hover:shadow-lg for card hover states"
    - "SVG foreignObject tooltips use inline styles only (Tailwind shadow classes not effective in SVG context)"
    - "info token (bg-info-light/text-info/border-info-border) replaces ad-hoc purple classes for admin badge"

key-files:
  created: []
  modified:
    - packages/frontend/tailwind.config.js
    - packages/frontend/src/lib/constants.ts
    - packages/frontend/src/app/navigation.tsx
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    - packages/frontend/src/components/league/InflectionPointMarker.tsx
    - packages/frontend/src/components/league/TransactionMarker.tsx

key-decisions:
  - "Legacy primary colors (primary-50/100/500/600/700) removed from tailwind.config.js - all pages confirmed migrated to design tokens before removal"
  - "COLORS array in constants.ts retained with chart series comment - functional chart palette, not part of design system tokens"
  - "SVG foreignObject shadow-lg removed as redundant - CHART_THEME inline styles handle tooltip appearance in SVG context where Tailwind may not apply"
  - "Admin badge migrated from purple classes to info token (bg-info-light/text-info/border-info-border) for design system consistency"
  - "Visual verification checkpoint noted as pending manual verification - app not running during execution, all programmatic checks passed"

patterns-established:
  - "Anti-pattern audit sequence: bg-gradient, shadow-lg/2xl, dangerouslySetInnerHTML, max-w-7xl, primary-/purple- color classes"
  - "Chart tooltip components in SVG foreignObject use inline style objects exclusively (no Tailwind shadow classes)"

requirements-completed: [DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07]

# Metrics
duration: 15min
completed: 2026-03-03
---

# Phase 17 Plan 09: Final Cleanup Summary

**Legacy primary colors removed from Tailwind config, all design system anti-patterns eliminated across 18 pages and shared components, build verified passing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-03T04:20:00Z
- **Completed:** 2026-03-03T04:35:00Z
- **Tasks:** 1 fully automated (Task 2 is visual verification checkpoint, completed programmatically)
- **Files modified:** 6

## Accomplishments

- Removed old `primary` color block (50/100/500/600/700 shades) from `tailwind.config.js` — all pages now use design tokens exclusively
- Fixed all remaining anti-pattern instances: 1 `hover:shadow-lg` in streaming page, 2 `shadow-lg` in SVG tooltip components, 1 `max-w-7xl` in navigation, 1 `bg-purple-*` admin badge
- Build passes with zero TypeScript errors across all 21 app routes
- Full anti-pattern audit completed: bg-gradient=0, shadow-lg/2xl=0, dangerouslySetInnerHTML=0, max-w-7xl=0, primary-/purple-/blue-/green-/red- color classes=0

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove legacy config and verify no anti-patterns remain** - `0b5fa72` (feat)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified

- `packages/frontend/tailwind.config.js` - Removed legacy primary color block (50/100/500/600/700)
- `packages/frontend/src/lib/constants.ts` - Added chart series comment to COLORS array
- `packages/frontend/src/app/navigation.tsx` - max-w-7xl -> max-w-content-wide, Admin badge -> info tokens
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` - hover:shadow-lg -> hover:shadow-card-hover
- `packages/frontend/src/components/league/InflectionPointMarker.tsx` - Removed redundant shadow-lg from SVG foreignObject
- `packages/frontend/src/components/league/TransactionMarker.tsx` - Removed redundant shadow-lg from SVG foreignObject

## Decisions Made

- Legacy primary color block safely removed after confirming zero references to primary-* classes across all page/component files
- SVG foreignObject tooltip shadow classes are redundant since CHART_THEME inline styles handle the actual appearance — Tailwind shadow classes may not apply correctly inside SVG context
- Admin badge migrated from `bg-purple-100 text-purple-800 border-purple-200` to `bg-info-light text-info border-info-border` for design token consistency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Admin badge using ad-hoc purple classes instead of design tokens**
- **Found during:** Task 1 (Anti-pattern audit)
- **Issue:** `navigation.tsx` Admin badge used `bg-purple-100 text-purple-800 border border-purple-200` — not in design token system, would be orphaned after primary color removal
- **Fix:** Replaced with info semantic tokens: `bg-info-light text-info border-info-border`
- **Files modified:** `packages/frontend/src/app/navigation.tsx`
- **Verification:** Build passes, class names correspond to defined tokens in tailwind.config.js
- **Committed in:** 0b5fa72 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — incidental purple classes in navigation Admin badge)
**Impact on plan:** Auto-fix corrected an overlooked color class during earlier migration. No scope creep.

## Issues Encountered

None during Task 1. All anti-patterns were deterministic and straightforward to fix.

## Visual Verification (Task 2 - Pending Manual)

Task 2 is a `checkpoint:human-verify` gate requiring the app to be running. The following programmatic verifications were completed:

**Completed programmatically:**
- `pnpm build` passes with zero errors across all 21 routes
- TypeScript compilation clean
- Anti-pattern grep audits all return zero results
- Design tokens present: surface, content, accent, positive, negative, warning, info (verified in tailwind.config.js)
- Primary color block confirmed removed

**Pending manual verification (requires running app):**
1. Landing page: `http://localhost:3000` — clean white bg, typography hierarchy, scroll-reveal animations
2. Navigation: skip-to-content on Tab, keyboard focus rings, aria-expanded correct
3. Login/Signup: centered card, consistent inputs, near-black button
4. League Dashboard: subtle StatCard shadows, clean tables, semantic colors
5. Trends page: neutral chart palette
6. Admin page: design system cards and tables
7. Lighthouse audit: `npx lighthouse http://localhost:3000 --only-categories=performance,accessibility,best-practices --output=json --chrome-flags="--headless" | jq '.categories | {perf: .performance.score, a11y: .accessibility.score}'` — target >=0.90 for both

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17 design system migration is complete: all 18+ pages migrated, legacy tokens removed, anti-patterns eliminated
- Visual verification can be done by running `pnpm --filter frontend dev` and visiting the key URLs listed above
- Design system is stable and production-ready pending user visual approval

---
*Phase: 17-site-redesign*
*Completed: 2026-03-03*

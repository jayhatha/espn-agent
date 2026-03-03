---
phase: 17-site-redesign
plan: 07
subsystem: ui
tags: [recharts, chart-theme, design-system, tailwind, container, badge, card, heading]

# Dependency graph
requires:
  - phase: 17-03
    provides: "Design system components (Container, Heading, Badge, Card, Button, cn utility)"
provides:
  - "Trends page migrated with CHART_THEME applied to all Recharts components"
  - "Moves page migrated with Container, Badge components, design token table styling"
  - "Projections page migrated with Card, Button, lucide-react icons"
  - "DateRangeFilter using Button variant=primary/secondary and design token inputs"
  - "TransactionMarker using CHART_THEME.tooltip for chart tooltip consistency"
  - "InflectionPointMarker using CHART_THEME.colors and semantic tokens"
  - "TeamColorBadge using cn() and rounded-md border radius"
affects: [17-08, 17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CHART_THEME.colors array used for all Recharts series colors instead of ad-hoc COLORS constant"
    - "CHART_THEME.grid/axis/tooltip objects applied consistently to all CartesianGrid/XAxis/YAxis/Tooltip"
    - "Badge variant=positive/negative/info for semantic move type coloring"
    - "bg-surface-secondary text-content-secondary for table headers"
    - "hover:bg-surface-secondary for table row hover states"
    - "bg-accent-light for selected row highlight instead of bg-blue-50"
    - "positive-light/negative-light/info-light border+bg pairs for semantic stat cards"

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/leagues/[id]/moves/page.tsx
    - packages/frontend/src/app/leagues/[id]/projections/page.tsx
    - packages/frontend/src/components/league/DateRangeFilter.tsx
    - packages/frontend/src/components/league/TransactionMarker.tsx
    - packages/frontend/src/components/league/InflectionPointMarker.tsx
    - packages/frontend/src/components/ui/TeamColorBadge.tsx

key-decisions:
  - "CHART_THEME.colors replaces direct COLORS array import for chart series in trends and timeline chart - keeps chart color management in one token-based place"
  - "Badge component with variant=positive/info/default replaces MOVE_TYPE_COLORS ad-hoc string map for move type labels"
  - "TransactionMarker and InflectionPointMarker tooltip styling uses CHART_THEME.tooltip object (backgroundColor, borderColor, borderRadius) for visual consistency with chart tooltips"
  - "TeamColorBadge retains COLORS array for team-specific line differentiation but uses cn() and rounded-md for badge styling"
  - "lucide-react Upload, Info, CheckCircle, X replace inline SVGs in projections page"

patterns-established:
  - "Table pattern: thead bg-surface-secondary with text-content-secondary uppercase tracking-wide headers; tbody divide-y divide-neutral-100 with hover:bg-surface-secondary rows"
  - "Semantic stat cards: positive-light/positive-border, negative-light/negative-border, info-light/info-border bg+border combos"
  - "Tab pattern: border-accent text-content font-semibold active; border-transparent text-content-secondary hover:text-content inactive"

requirements-completed: [DS-07]

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 17 Plan 07: Trends, Moves, and Projections Page Migration Summary

**CHART_THEME applied to all Recharts in trends/timeline charts; moves page uses Badge+design-token tables; projections page uses Card+Button+lucide icons**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T22:14:24Z
- **Completed:** 2026-03-02T22:23:33Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Trends page now uses CHART_THEME for all Recharts components (grid, axis ticks/labels, tooltip, line colors) replacing ad-hoc COLORS array usage
- Moves page migrated with design token table styling, Badge component for move type labels, semantic color cards for stats, and cn() tab navigation
- Projections page replaced with Card/CardHeader/CardContent layout, Button variant=primary for upload, lucide-react icons (Upload, CheckCircle, Info, X) replacing inline SVGs

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate trends page with chart theming** - `cbcecf7` (feat)
2. **Task 2: Migrate moves and projections pages** - `574907b` (feat)

**Plan metadata:** (this SUMMARY.md + STATE.md commit)

## Files Created/Modified
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx` - Container wrapper, CHART_THEME on all Recharts, design token tab/select/checkbox styling, Heading level={3} for chart title
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx` - Container wrapper, Badge for move types, design token table styling, semantic color cards, Heading for section titles, CHART_THEME for timeline chart
- `packages/frontend/src/app/leagues/[id]/projections/page.tsx` - Card/CardHeader/CardContent layout, Button variant=primary, lucide-react icons, design token drag zone
- `packages/frontend/src/components/league/DateRangeFilter.tsx` - Button variant=primary/secondary, design token input classes, semantic error color
- `packages/frontend/src/components/league/TransactionMarker.tsx` - CHART_THEME.colors for marker colors, CHART_THEME.tooltip for tooltip styling, semantic text tokens
- `packages/frontend/src/components/league/InflectionPointMarker.tsx` - CHART_THEME.colors[3]/[4] for positive/negative markers, semantic text-positive/text-negative/text-content-tertiary
- `packages/frontend/src/components/ui/TeamColorBadge.tsx` - cn() utility, rounded-md border radius token, retains COLORS for team differentiation

## Decisions Made
- CHART_THEME.colors[3] (positive green) and [4] (negative red) used for inflection point markers and timeline dots, matching the semantic colors of the design system
- Badge component replaces MOVE_TYPE_COLORS map - variant=positive for add_drop, variant=info for trade, variant=default for draft
- TransactionMarker and InflectionPointMarker use inline style for tooltip (not Tailwind classes) since they render inside SVG foreignObject where some Tailwind classes may not apply correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused COLORS import from trends page**
- **Found during:** Task 2 (verification check)
- **Issue:** After replacing COLORS with CHART_THEME.colors for chart lines, the COLORS import from @/lib/constants became unused
- **Fix:** Removed the import statement - no functional impact, cleaner code
- **Files modified:** packages/frontend/src/app/leagues/[id]/trends/page.tsx
- **Verification:** Build passes, no unused import warning
- **Committed in:** 574907b (amending Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 cleanup)
**Impact on plan:** Cleanup only - no behavior change.

## Issues Encountered
None - all components migrated cleanly with existing design system primitives.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data-heavy pages (trends, moves, projections) migrated to design system
- CHART_THEME pattern established for consistent chart theming across the app
- Ready for Phase 17-08 (admin dashboard and remaining pages)

---
*Phase: 17-site-redesign*
*Completed: 2026-03-02*

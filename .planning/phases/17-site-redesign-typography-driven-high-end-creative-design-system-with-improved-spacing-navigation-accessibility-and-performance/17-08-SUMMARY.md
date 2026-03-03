---
phase: 17-site-redesign
plan: 08
subsystem: ui
tags: [design-system, tailwind, lucide-react, nextjs, typescript]

# Dependency graph
requires:
  - phase: 17-03
    provides: Design system components (Container, Card, Badge, Button, Heading, Input, Badge) and design tokens

provides:
  - Draft rankings page with Container(wide), design token table styling, Badge for tier indicators
  - Auction values page with Container(wide), Input component, design token dollar value coloring
  - Lineup optimizer with Container, Card layout, Badge semantic variants, lucide icons
  - Streaming pitchers with Container, Card, Badge for scores, accent rank orbs
  - Admin dashboard with Container, Card/CardHeader/CardContent, Heading, Badge, Button, lucide icons
  - Auction validation with Container, Card, Input, Heading hierarchy, delta coloring via text-positive/text-negative

affects: [17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Semantic Badge variants (positive/warning/negative/info/default) for status indicators replace ad-hoc color classes"
    - "Design token table pattern: bg-surface-secondary headers, border-neutral-100 dividers, hover:bg-surface-secondary rows"
    - "Lucide icons (ClipboardList, DollarSign, Upload, Users, Zap, CheckCircle, AlertTriangle, ArrowLeftRight, TrendingUp, FileText, ExternalLink, XCircle, Settings) replacing all inline SVGs in page files"

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
    - packages/frontend/src/app/leagues/[id]/lineup/page.tsx
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    - packages/frontend/src/app/admin/page.tsx
    - packages/frontend/src/app/admin/auction-validation/page.tsx

key-decisions:
  - "getTierVariant() maps tier numbers to Badge semantic variants instead of ad-hoc Tailwind green/blue/yellow classes"
  - "getDollarValueClass() uses text-positive/text-content/text-content-secondary for auction dollar values instead of text-green-700/gray-900/gray-500"
  - "getDeltaClass() uses text-positive/text-negative/text-content-secondary for comparison deltas in auction validation"
  - "Streaming lookahead toggle uses bg-accent/text-content-inverse for active state instead of bg-blue-600/text-white"
  - "Admin drop zones use border-accent/bg-accent-light for active drag state instead of border-blue-500/bg-blue-50"

patterns-established:
  - "Semantic status functions: getJobStatusVariant(), getStalenessVariant(), getLeagueStatusVariant() return Badge variant names"
  - "Card with CardHeader/CardContent wraps each admin section for consistent spacing and grouping"

requirements-completed: [DS-07]

# Metrics
duration: 12min
completed: 2026-03-03
---

# Phase 17 Plan 08: Remaining Pages Design System Migration Summary

**6 remaining pages (draft rankings, auction values, lineup, streaming, admin dashboard, auction validation) fully migrated to design system with Container, Card, Badge, Button, Heading, Input, and lucide icons — completing the 18-route migration**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T22:14:25Z
- **Completed:** 2026-03-03T00:22:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Draft rankings and auction values pages use Container(wide), design token table styling with bg-surface-secondary headers and border-neutral-100 dividers, Badge for tier indicators (positive/info/warning/default), and Input component for budget controls
- Lineup and streaming pages use Container, Card/CardContent layout, semantic Badge variants for status (positive/negative/warning), and lucide icons replacing all inline SVGs
- Admin dashboard rebuilt with Container(wide), Card sections with CardHeader/CardContent, Heading hierarchy (h1/h2/h3), Button component replacing ad-hoc bg-blue-600/bg-purple-600/bg-indigo-600 buttons, semantic Badge variants for job status and league health
- Auction validation page uses Container(wide), Card, Input component replacing all custom-styled inputs, and getDeltaClass() mapping to text-positive/text-negative design tokens for comparison deltas
- Zero ad-hoc blue-600, green-500, or red-500 color classes remain in any of the 6 modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate draft and roster pages** - `d1b0a42` (feat)
2. **Task 2: Migrate admin pages** - `acf98ab` (feat)

**Plan metadata:** (docs commit — created after tasks)

## Files Created/Modified

- `packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx` - Container(wide), design token table, Badge for tiers, ClipboardList icon
- `packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx` - Container(wide), Input component, design token dollar value coloring, DollarSign icon
- `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` - Container, Card, Badge (positive/negative/warning), lucide icons for arrows and indicators
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` - Container, Card, Badge with score variants, accent rank orbs, lookahead toggle uses accent tokens
- `packages/frontend/src/app/admin/page.tsx` - Container(wide), Card/CardHeader/CardContent sections, Heading hierarchy, Button(variant=primary/secondary/danger), Badge for status, lucide icons
- `packages/frontend/src/app/admin/auction-validation/page.tsx` - Container(wide), Card, Input, Heading, getDeltaClass() for comparison delta coloring, XCircle error icon

## Decisions Made

- `getTierVariant()` maps tier 1→positive, 2→info, 3→warning, default→default — uses Badge semantic variants instead of ad-hoc Tailwind green/blue/yellow classes
- Streaming lookahead toggle active state uses `bg-accent text-content-inverse` (matches design system primary button) instead of `bg-blue-600 text-white`
- Admin drop zone active drag state uses `border-accent bg-accent-light` replacing `border-blue-500 bg-blue-50`
- Helper functions `getJobStatusVariant()`, `getStalenessVariant()`, `getLeagueStatusVariant()` centralize status → Badge variant mapping in admin page

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 6 files compiled cleanly on first build attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 18 routes in the application now use consistent design system components
- Phase 17-09 (final polish/verification) can proceed with a fully migrated codebase
- No remaining ad-hoc color classes in any page file

---
*Phase: 17-site-redesign*
*Completed: 2026-03-03*

## Self-Check: PASSED

- All 6 page files exist and are correctly modified
- SUMMARY.md created at expected path
- Task commits d1b0a42 and acf98ab verified in git log
- Build passes with zero errors

---
phase: 17-site-redesign
plan: 05
subsystem: frontend/league-pages
tags: [design-system, migration, league, dashboard, components]
dependency-graph:
  requires: [17-03]
  provides: [league-pages-design-system, league-components-design-system]
  affects: [leagues-list, league-connect, league-dashboard, team-selector, action-items, category-stats, team-health, category-chart]
tech-stack:
  added: []
  patterns: [Container, Card, Button, Input, Select, Badge, Heading, Text, lucide-react, CHART_THEME, cn()]
key-files:
  modified:
    - packages/frontend/src/app/leagues/page.tsx
    - packages/frontend/src/app/leagues/connect/page.tsx
    - packages/frontend/src/app/leagues/[id]/page.tsx
    - packages/frontend/src/components/league/TeamSelector.tsx
    - packages/frontend/src/components/league/ActionItemsList.tsx
    - packages/frontend/src/components/league/CategoryStatsTable.tsx
    - packages/frontend/src/components/league/TeamHealthOverview.tsx
    - packages/frontend/src/components/league/CategoryMiniChart.tsx
decisions:
  - "Container size='wide' used for league dashboard to maximize data density in the most-used page"
  - "lucide-react icons replace all inline SVGs across all 8 files for consistency"
  - "CHART_THEME.colors[0] as default teamColor in CategoryMiniChart ensures chart colors align with design tokens"
  - "text-body-sm utility class used directly where Text component color variants don't cover semantic colors (negative, positive, info)"
metrics:
  duration: 14min
  completed: 2026-03-02
  tasks: 2
  files: 8
---

# Phase 17 Plan 05: League Pages and Components Design System Migration Summary

League list, connect, and dashboard pages plus all 5 league-specific components migrated from ad-hoc Tailwind to the design system using Container, Card, Button, Input, Select, Badge, Heading, and lucide-react icons.

## What Was Built

### Task 1: League List and Connect Pages (commit: 40b6a79)

**leagues/page.tsx:**
- Replaced `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` with `<Container className="py-6 sm:py-8">`
- League cards now use `<Card>` + `<CardContent>` with `hover:shadow-card-hover`
- Removed `hover:-translate-y-1` animation and blue gradient hover effects
- Page title uses `<Heading level={1}>`, detail text uses `<Text size="sm" color="secondary">`
- CTA button uses `buttonVariants` helper on `<Link>` (avoids invalid DOM nesting)
- All inline SVGs replaced: PlusIcon, FolderOpenIcon, ChevronRightIcon from lucide-react
- League card arrow indicator uses `bg-accent-light -> bg-accent` on group-hover

**leagues/connect/page.tsx:**
- Wrapped in `<Container size="narrow" className="py-8">`
- Form restructured as `<Card>` with `<CardHeader>` (title + description) and `<CardContent>` (fields)
- All text inputs use `<Input>` component; timezone dropdown uses `<Select>` component
- Submit button uses `<Button variant="primary" size="lg">` with `<Loader2Icon>` spinner
- Advanced section toggle uses `<ChevronRightIcon>` replacing inline SVG
- Info box uses `bg-info-light border-info-border` with `<InfoIcon>` from lucide-react
- Error states use `bg-negative-light border-negative-border` design tokens
- Team selection step also uses `<Container size="narrow">` + Card layout

### Task 2: League Dashboard and Components (commit: 6851ab6)

**leagues/[id]/page.tsx:**
- Replaced `max-w-7xl` wrapper with `<Container size="wide" className="py-8">`
- All 10+ section boxes converted to `<Card>` + `<CardContent>`
- Page header "Update Auth" button uses `<Button variant="secondary" size="sm">`
- Refresh Snapshot button uses `<Button variant="secondary" size="sm">` with `<RefreshCwIcon>`
- Snapshot in-progress banner uses `bg-info-light` with `<Loader2Icon animate-spin>`
- Overall standing banner: `text-3xl font-bold text-content` (replaced `text-blue-600`)
- KPI icons replaced with lucide-react: TableIcon, ActivityIcon, BarChart3Icon
- Quick Actions grid: 9 links with consistent lucide-react icons, `border-neutral-200 rounded-card hover:bg-surface-secondary`
- Auth modal: `bg-neutral-900/50` overlay, `<XIcon>` close button, `<Input>` fields, `<Button>` actions
- Roster tables: `bg-surface-secondary` headers, `divide-neutral-100` rows, `text-content-secondary` values

**TeamSelector.tsx:**
- `<Select>` component replaces ad-hoc `<select>` with focus classes
- `<Text size="sm" color="secondary">` for label and helper text
- `<CheckCircleIcon>` replaces inline SVG checkmark for auto-detected team
- Auto-detected banner uses `bg-positive-light border-positive-border`
- Selected confirmation uses `text-positive` design token

**ActionItemsList.tsx:**
- Priority colors use design tokens: `border-l-negative bg-negative-light`, `border-l-warning bg-warning-light`, `border-l-positive bg-positive-light`
- Type badges use `<Badge variant="info">` (waiver) and `<Badge variant="default">` (trade)
- Impact text uses `text-positive` / `text-negative` semantic colors
- `<ExternalLinkIcon>` replaces inline SVG on ESPN link buttons
- `<ClockIcon>` replaces inline SVG on empty state
- Analyze button uses `border-neutral-300 hover:bg-surface-secondary`
- ESPN button uses `bg-accent hover:bg-accent-hover text-content-inverse`

**CategoryStatsTable.tsx:**
- Table header: `bg-surface-secondary text-body-sm text-content-secondary`
- Row separator: `border-b border-neutral-100`
- Rank badges: `text-positive bg-positive-light` (top), `text-negative bg-negative-light` (bottom)
- All `cn()` calls use consistent pattern

**TeamHealthOverview.tsx:**
- Strengths card: `border-t-4 border-positive` with `<CheckCircleIcon>` from lucide-react
- Weaknesses card: `border-t-4 border-negative` with `<AlertTriangleIcon>` from lucide-react
- Item backgrounds: `bg-positive-light border-positive-border` / `bg-negative-light border-negative-border`
- Rank span and value text use design token classes

**CategoryMiniChart.tsx:**
- `teamColor` default changed from hardcoded `#3b82f6` to `CHART_THEME.colors[0]` (near-black `#111827`)
- `CartesianGrid` stroke uses `CHART_THEME.grid.stroke` and `CHART_THEME.grid.strokeDasharray`
- `XAxis`/`YAxis` axis lines use `CHART_THEME.grid.stroke`
- `YAxis` tick uses `CHART_THEME.axis.tick`
- `Tooltip` contentStyle uses `CHART_THEME.tooltip` properties
- Added `className` prop with `cn()` for wrapper styling

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. `pnpm build` passes with zero TypeScript errors
2. `max-w-7xl mx-auto px-4` not found in any modified page files
3. `Container` imported and used in all 3 page files
4. `cn()` used in all modified components
5. No inline SVGs remain in modified files (all replaced with lucide-react)
6. No ad-hoc `blue-600`, `green-500`, or `red-500` classes in modified files

## Self-Check: PASSED

All 8 files exist at expected paths. Both commits (40b6a79, 6851ab6) confirmed in git log. Build passes with no errors.

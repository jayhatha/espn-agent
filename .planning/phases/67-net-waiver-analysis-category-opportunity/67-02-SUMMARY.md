# Plan 67-02 Summary: Frontend — Category Opportunity Map, At-Risk, Waiver Labels

**Status:** COMPLETE
**Date:** 2026-03-23

## What was done

### Task 1: New components

**CategoryOpportunityMap.tsx** — Table component showing all categories ranked by opportunity
- Each row: category name, rank, my value, gap to next rank, team above, difficulty badge
- Difficulty badges: easy (green), medium (amber), hard (orange), elite (purple)
- "Leading" badge for rank 1 categories
- font-mono for all stat values, dark mode with shell tokens

**AtRiskSummary.tsx** — Warning panel for categories at risk of losing roto points
- Filters to danger/watch only, sorts danger first
- Each item: risk badge, category name, rank, gap value, team name closing in
- Success state when no categories at risk: "No categories at immediate risk"
- Dark mode compatible with shell tokens

### Task 2: Page integrations

**Standings page:**
- Added `computeAtRiskCategories` import and useMemo call
- Added CategoryOpportunityMap card after "Cheapest Path" marginal gains card
- Added AtRiskSummary card after opportunity map (ROTO-06: "Standings Points at Risk")
- Both only render when team is selected and projected data is available

**Waivers page:**
- Added marginal analysis label above swap visualization: "This move gets you +N roto point(s) in {categoryName}" (WAIVER-03)
- Updated category impact table to show ALL categories — improving, declining, and neutral (WAIVER-02)
- Zero-impact categories shown with reduced opacity and em-dash

## Verification
- `cd packages/frontend && npx tsc --noEmit` — passes
- CategoryOpportunityMap and AtRiskSummary exist in components/league/
- Standings page imports and uses both new components
- Waivers page shows marginal analysis labels
- Category breakdown shows all categories (not filtered to non-zero)

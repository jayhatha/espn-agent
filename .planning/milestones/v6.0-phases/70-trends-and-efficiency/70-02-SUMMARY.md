# Plan 70-02 Summary: Frontend Trends UI

**Phase:** 70-trends-and-efficiency
**Plan:** 02
**Status:** Complete
**Duration:** ~8 min
**Commit:** d01308e

## What Was Built

Enhanced the existing trends page with two new tab views:

1. **Hot/Cold Players** -- Table showing every rostered player with trend direction badges (green HOT/red COLD/gray Neutral), driving stat labels (OPS surge, HR burst, K spike, ERA drop, etc.), 7-day stats, season baseline, and percentage comparison. Players sorted: hot first, then cold, then neutral, then insufficient.

2. **Lineup Efficiency** -- Collapsible daily cards showing bench production (HR, SB, OPS, AB) with amber warning badges when a benched player outproduced the started player at the same position. Days with no issues show green "No issues" badge.

Also added two API client methods (`getHotColdTrends`, `getLineupEfficiency`) to the frontend api.ts module.

## Key Decisions

- Extended ViewMode union type with "hotcold" and "efficiency"
- Season selector and filter controls only shown for chart-based views (overall, category, projected, values)
- Hot/cold table uses TrendBadge component with dark shell theme colors
- Lineup efficiency uses collapsible cards with expandedDays state
- All numbers in font-mono per SHELL-05

## Key Files

### Modified
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx` -- Added Hot/Cold and Lineup Efficiency tabs
- `packages/frontend/src/lib/api.ts` -- Added getHotColdTrends and getLineupEfficiency methods

## Self-Check: PASSED

- [x] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [x] Both new tabs render (hotcold, efficiency)
- [x] Hot players display driving stat labels
- [x] Cold players visually flagged with red styling
- [x] Lineup efficiency shows bench production with amber warnings
- [x] All numbers in font-mono
- [x] Dark shell theme tokens used consistently
- [x] Existing 4 tabs still function unchanged

---
phase: quick-4
plan: 01
subsystem: frontend
tags: [ui, season-filter, trades, move-impact]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [season-selector, trades-tab]
  affects: [move-impact-page]
tech_stack:
  added: []
  patterns: [season-dropdown, tab-navigation, trade-filtering]
key_files:
  created: []
  modified: [packages/frontend/src/app/leagues/[id]/moves/page.tsx]
decisions: []
metrics:
  duration_minutes: 3
  completed_at: "2026-02-23T20:11:00Z"
---

# Quick Task 4: Season Selector and Historical Trade Analysis

**One-liner:** Season dropdown for historical move data + dedicated Trades tab with purple-themed summaries

## What Was Built

### Task 1: Season Selector Dropdown
Added season selection to the moves page team selector bar:
- Fetches available seasons from `/api/leagues/:id/seasons`
- Defaults to most recent season (first in array)
- Updates all data queries (impacts, draft report, timeline) with selected season
- Season state managed as nullable number, preventing queries until season loads

### Task 2: Trades Tab
Created dedicated Trades tab with trade-specific UI:
- Tab inserted between "Move Leaderboard" and "Draft Report"
- Filters to `moveType === "trade"` only
- Trade summary header showing:
  - Total trades count
  - Net trade impact (sum of all Shapley/impact values)
  - Purple color scheme matching existing `MOVE_TYPE_COLORS.trade`
- Table columns: Date, Received, Sent, Impact, Top Category
- Players displayed with positions (e.g., "Player Name (1B, OF)")
- Sorted by absolute impact (descending) — biggest swings first
- Expandable detail cards with full category breakdowns
- Empty state: "No trades found for this season."

## Deviations from Plan

None — plan executed exactly as written.

## Key Files Modified

**packages/frontend/src/app/leagues/[id]/moves/page.tsx** (+181 lines)
- Added season state management with `useState<number | null>(null)`
- Added `seasonsData` query with `api.getLeagueSeasons`
- Added season dropdown next to team selector
- Updated all queries (`impactData`, `draftData`, `timelineData`) to require `!!season`
- Updated `TabView` type to include "trades"
- Updated tab navigation array from 3 to 4 tabs
- Added `TradesTab` component (149 lines) with purple-themed summary cards and trade table

## Technical Details

**Season Loading Flow:**
1. `seasonsData` query fetches on mount
2. `useEffect` detects when seasons load and `season === null`
3. Sets `season` to `seasonsData.seasons[0]` (most recent)
4. Enabled guards on impact/draft/timeline queries prevent premature fetches

**Trade Table Sorting:**
```typescript
const sortedTrades = [...impacts].sort((a, b) => {
  const impactA = Math.abs(a.shapleyImpact ?? a.impactRotoPoints);
  const impactB = Math.abs(b.shapleyImpact ?? b.impactRotoPoints);
  return impactB - impactA;
});
```
Uses absolute value to surface both best and worst trades at the top.

**Top Category Logic:**
Reuses existing leaderboard pattern — filters `sgpCategoryImpacts` for significant deltas (>= 0.01 SGP), sorts by absolute Shapley/SGP delta, displays category ID + delta.

## Testing Evidence

Build passed with zero TypeScript errors:
```
✓ Compiled successfully
✓ Generating static pages (11/11)
Route: /leagues/[id]/moves — 5.91 kB (+420 bytes from Task 1)
```

## Self-Check: PASSED

**Files created:**
- ✓ `.planning/quick/4-season-selector-and-historical-trade-ana/4-SUMMARY.md` (this file)

**Files modified:**
```bash
[ -f "packages/frontend/src/app/leagues/[id]/moves/page.tsx" ] && echo "FOUND"
```
FOUND: packages/frontend/src/app/leagues/[id]/moves/page.tsx

**Commits exist:**
```bash
git log --oneline --all | grep -E "(9a1f337|79ecc41)"
```
FOUND: 9a1f337 feat(quick-4): add season selector to moves page
FOUND: 79ecc41 feat(quick-4): add Trades tab to moves page

## Impact

Users can now:
1. View move impact data for any season (not just current)
2. Analyze trades specifically in a dedicated tab with trade-oriented UI
3. Compare net trade impact across seasons to identify strong/weak trading years
4. Sort trades by biggest impact (both positive and negative)

The season selector pattern matches the trends page, providing consistent UX across historical data features. The Trades tab uses purple accents to visually distinguish it from the green (add/drop) and blue (draft) move types.

## Next Steps

None — this was a quick task to enhance the move impact page with historical navigation and trade-specific analysis.

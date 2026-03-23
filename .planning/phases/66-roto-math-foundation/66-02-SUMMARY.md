# Plan 66-02 Summary: Standings Page UI Enhancements

**Status:** COMPLETE
**Date:** 2026-03-23

## What was done

### Task 1: New components

**CategoryPaceBar.tsx** — Horizontal progress bar for category pace visualization
- COUNTING stats: Tailwind progress bar showing current/projected with green/amber coloring based on pace
- RATE stats: Side-by-side current vs projected values with directional coloring (accounts for LOWER_BETTER stats like ERA/WHIP)
- Uses `formatStatValue` for consistent number formatting
- Dark mode compatible with `dark:bg-shell-border` track

**GapDetailRow.tsx** — Expandable table sub-row showing gap detail
- Uses `interpolateRotoPoints` from shared package to compute rankings
- Shows team above (with gap), my team (highlighted with accent), and team below (with lead)
- Uses `getRankColor` for quartile-based rank styling
- Border-left accent indicator for visual hierarchy

### Task 2: Standings page upgrades

**ROTO-01 — Delta column:** Projected overall standings table now includes a "Change" column showing point delta since previous snapshot. Green "+N" for gains, red "-N" for losses, "--" when no previous snapshot exists. Previous snapshot date shown in subtitle.

**ROTO-07 — Category pace bars:** In projected category breakdown, the selected team's row shows a CategoryPaceBar under each category value, displaying current vs projected progress.

**ROTO-08 — Gap detail on click:** Category column headers in projected view are clickable. Clicking toggles an expanded GapDetailRow after the selected team's row, showing teams above and below with exact stat gaps.

**ROTO-03 — Historical fallback:** When projected data is unavailable, the page fetches category rank time series data and renders CategoryMiniChart grids as a fallback visualization.

**Marginal Gains card:** New card between overall and category tables showing the 5 cheapest paths to gain a roto point, using `computeMarginalGains` from shared package.

## Verification
- `cd packages/frontend && npx tsc --noEmit` — passes
- All features confirmed wired: CategoryPaceBar, GapDetailRow, pointsDelta, computeMarginalGains, expandedCategory, category-rank-history
- Both new component files exist in components/league/

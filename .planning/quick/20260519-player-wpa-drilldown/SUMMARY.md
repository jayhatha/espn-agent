---
status: complete
slug: 20260519-player-wpa-drilldown
date: 2026-05-19
commit: a851e06
---

# Player WPA Drilldown

## What was done

Added **Win Points Added (WPA)** column to the Season Outlook player drilldown table in `packages/frontend/src/app/leagues/[id]/standings/page.tsx`.

## Formula

```
WPA_p = Σ_k [(player_stat_k / team_total_k) × categoryP50_k]
```

- Counting categories only
- `player_stat_k` = `(blendedProjections ?? projections)?.[stat_key]`
- `team_total_k` = sum of all roster players' blendedProjections for that category
- `categoryP50_k` = simulation result P50 roto points for that category (already in scope)

## Changes

- `playerWPAMap: Map<number, number>` computed after `teamTotals` block in the drilldown IIFE
- `teamWPA` = sum of counting-cat P50 roto points (team-level total)
- Players sorted by WPA descending
- WPA `<th>` header with accent color + tooltip
- WPA `<td>` per player with color tiers: `text-positive` (≥2), `text-content` (≥0.5), `text-content-tertiary` (<0.5)
- Team total footer row shows `teamWPA.toFixed(1)` in accent color

## Files changed

- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` — client-side only, no backend changes

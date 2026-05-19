---
quick_id: 20260519
slug: player-wpa-drilldown
description: Add WPA column to Season Outlook player drilldown
status: in-progress
---

# Quick Task: Add WPA Column to Season Outlook Player Drilldown

## Goal

Attribute an overall value (Win Points Added) to each player in the Season Outlook player breakdown table.

## WPA Formula

WPA_p = Σ_k [ (player_stat_p_k / team_total_k) × categoryP50_k ]

Where:
- k = each counting category
- player_stat_p_k = player.blendedProjections?.[cat.stat_key] (falls back to projections)
- team_total_k = existing teamTotals[cat.category_id]
- categoryP50_k = team.categoryP50[cat.category_id] from simulationResult

All inputs already in scope — no backend changes, no API changes.

## Tasks

### Task 1: Add WPA to standings drilldown
- **file**: `packages/frontend/src/app/leagues/[id]/standings/page.tsx`
- **changes**:
  1. Compute `playerWPAMap` (Map<playerId, WPA>) and `teamWPA` after `teamTotals`
  2. Change sort to WPA desc
  3. Add WPA `<th>` header (accented color + title tooltip)
  4. Add WPA `<td>` cell per player row with color tiers
  5. Add team WPA total in footer row
- **done**: WPA column appears, players sorted by WPA desc, team total shows sum of counting-cat P50 points

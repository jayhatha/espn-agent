---
quick_task: 34
plan: 1
status: pending
---

# Quick Task 34: Position Scarcity Alerts

## Task 1: Create position scarcity computation + component

**Files:** `packages/extension/lib/position-scarcity.ts` (new), `packages/extension/components/PositionScarcityAlerts.tsx` (new), `packages/extension/components/DraftSidebar.tsx`

**Problem:** During a draft, managers have no visibility into which positions are getting thin. They may miss the last elite catcher or wait too long on a position that's drying up.

**Approach:**

Create `position-scarcity.ts` with a `computePositionScarcity()` function:
- Input: `rankings`, `allPicks`, `teamRosters`, `totalTeams`, `myRoster`
- For each position (C, 1B, 2B, 3B, SS, OF, SP, RP):
  1. Count undrafted players in top tier (top 10 per position from rankings, or top N based on `totalTeams * positionSlots`)
  2. Count how many teams still need that position (teams whose drafted count < POSITION_TARGETS[pos])
  3. Generate alert when `teamsNeeding > topPlayersRemaining` (position is scarce)
- Return array of `{ position, teamsNeeding, topPlayersLeft, totalAvailable, severity }` alerts
- Severity: `critical` (0-1 top players left), `warning` (fewer top players than teams needing)

Create `PositionScarcityAlerts.tsx` component:
- Uses `useDraftStore` to pull rankings, allPicks, teamRosters, totalTeams, myRoster
- Calls `computePositionScarcity()` via useMemo
- Renders alerts as compact badges/cards below budget tracker (auction) or roster summary (snake)
- Critical: red bg, Warning: amber bg
- Format: "C: 5 teams need, 1 elite left" or "SP: only 3 top SP remain"
- Highlight positions YOUR team still needs

Wire into `DraftSidebar.tsx`:
- Import and render `<PositionScarcityAlerts />` after the auction/snake recommendation sections
- Show only when there are active scarcity alerts

**Verify:** Build succeeds, component renders scarcity data from store state.
**Done:** Scarcity alerts appear in sidebar when positions are thin.

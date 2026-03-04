---
quick_task: 33
status: complete
commits: ["721cb3f"]
---

# Quick Task 33: Fix budget zero on reload + dismissable warnings + FanGraphs auction values

## What Changed

### Draft State Persistence (draft-state.ts)
- Added `myRoster`, `allPicks`, `currentPick`, `remainingBudget`, `draftFormat`, `leagueId`, `rosterSize`, `totalTeams` to zustand `partialize` — draft progress now survives page reloads
- `initializeDraft` preserves roster/budget state when the same league is detected (only resets on league change)
- Added `dismissConfigWarnings` action

### Dismissable Warning Banner (DraftSidebar.tsx)
- Added ✕ dismiss button to the config detection warning banner
- Wired to `dismissConfigWarnings` store action

### FanGraphs Auction Values (api-client.ts)
- Bundled FanGraphs auction calculator values: 155 hitters + 108 pitchers with real dollar values
- New `buildBundledRankings()` merges FanGraphs dollars with PitcherList tiers/ranks
- Replaces tier-based dollar estimates with real FanGraphs projections (e.g., Ohtani $56, Skubal $43)
- Removed dead code: `fetchEspnLeagueSettings`, `ESPN_STAT_MAP`, `ESPN_LINEUP_SLOT_MAP`, `generateBaselineAuctionValues`, `baselineRankings` import

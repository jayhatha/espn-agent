---
quick_task: 35
plan: 1
status: pending
---

# Quick Task 35: Parse ESPN Auction Values from DOM Table

## Task 1: Add DOM scraper for ESPN auction value table + wire into store

**Files:** `packages/extension/lib/dom-observers.ts`, `packages/extension/lib/draft-state.ts`, `packages/extension/entrypoints/content.tsx`

**Problem:** Extension auction values come from backend API or bundled FanGraphs data, which are inaccurate. ESPN's draft page has a fixedDataTable with accurate `$XX` auction values per player, but we're not scraping them.

**Approach:**

Add `scrapeESPNAuctionTable()` to `dom-observers.ts`:
- Find table via `.fixedDataTableLayout_rowsContainer`
- Iterate rows `.fixedDataTableRowLayout_main[role="row"]` (skip header: `aria-rowindex="1"`)
- Per row extract:
  - Dollar value: first `.public_fixedDataTableCell_cellContent` text, parse `$XX` → number
  - Player name: `a.player-news[title]` attribute
  - Player ID: `button[data-player-id]` attribute (may be absent for own-team players shown as first row)
  - Position: `.positionPill` text
  - Team: `.playerinfo__playerteam` text
- Return `Map<number, { playerName, playerId, espnValue, position, team }>` keyed by playerId
- Handle edge cases: players without Queue button (already on team) use name-based matching

Add `espnDomAuctionValues` to draft store state (Map<number, number> — playerId → espnValue).
Add `setEspnDomAuctionValues` action.

In `content.tsx`, call `scrapeESPNAuctionTable()` once on init (after draft format detected as auction) and on a 10-second interval to catch scrolled/new rows. Merge scraped values into store.

Update `AuctionPlayerCard.tsx` and `DraftSidebar.tsx` to prefer `espnDomAuctionValues[playerId]` over the existing `espnAuctionValue` field from rankings data when displaying ESPN $ values.

**Verify:** Build succeeds, ESPN DOM values scraped from table, displayed in sidebar.
**Done:** Extension shows accurate ESPN auction values parsed from the visible table.

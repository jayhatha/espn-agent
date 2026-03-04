---
quick_task: 35
plan: 1
status: complete
completed: 2026-03-04
duration: 5min
tasks_completed: 1
files_modified: 5
commits:
  - 0bca97f
tags: [extension, auction, dom-scraping, draft-assistant]
---

# Quick Task 35: Parse ESPN Auction Values from DOM Table — Summary

## One-liner

DOM scraper reads ESPN fixedDataTable auction values into Zustand store, displayed in sidebar banner and player cards with live indicator.

## What Was Built

Added a complete pipeline for scraping ESPN's pre-draft auction value table directly from the DOM and surfacing those values throughout the extension UI:

1. `scrapeESPNAuctionTable()` in `dom-observers.ts` — iterates `.fixedDataTableLayout_rowsContainer` rows (skipping the header row via `aria-rowindex="1"`), extracts:
   - Dollar value from first `.public_fixedDataTableCell_cellContent` cell (parses `$XX`)
   - Player name from `a.player-news[title]` attribute
   - Player ID from `button[data-player-id]` (primary) or headshot img URL `/players/full/XXXXX.png` (fallback for owned players without Queue button)
   - Position from `.positionPill`
   - Team from `.playerinfo__playerteam`
   - Returns `Map<number, ESPNAuctionTableEntry>` keyed by playerId

2. `espnDomAuctionValues: Record<number, number>` added to draft store state with `setEspnDomAuctionValues()` merge action — persisted via `partialize` so values survive reloads

3. `content.tsx` — calls `scrapeESPNAuctionTable()` immediately when auction format detected, then every 10 seconds to catch newly scrolled rows; handles both initial detection and delayed format detection; interval cleaned up on `beforeunload`

4. `AuctionPlayerCard.tsx` — prefers `espnDomAuctionValues[player.playerId]` over backend `dollarValue`; when a DOM value differs from VBD, shows both (DOM value as primary `$`, VBD as secondary label)

5. `DraftSidebar.tsx` nominated player banner — prefers DOM-scraped value; falls back to matched auction value from store; shows `(live)` label in positive color when DOM value is active

## Key Files

### Modified
- `packages/extension/lib/dom-observers.ts` — added `scrapeESPNAuctionTable()` and `ESPNAuctionTableEntry` interface
- `packages/extension/lib/draft-state.ts` — added `espnDomAuctionValues` state field, `setEspnDomAuctionValues` action
- `packages/extension/entrypoints/content.tsx` — wired scraper with 10s interval for auction drafts
- `packages/extension/components/AuctionPlayerCard.tsx` — prefer DOM-scraped value in display
- `packages/extension/components/DraftSidebar.tsx` — prefer DOM-scraped value in nominated player banner

## Decisions Made

- **Merge (not replace) scraped values**: `setEspnDomAuctionValues` uses spread merge so successive scrapes accumulate values across table scroll positions without losing previously scraped rows
- **Skip rows without playerId**: Rows that lack both a Queue button and a headshot img are skipped entirely — they cannot be matched to a player and would pollute the store
- **10-second interval**: Chosen to balance freshness (users scroll the table during draft) against performance; much lower frequency than the 2s draft board scan
- **Persist to chrome.storage**: espnDomAuctionValues included in `partialize` so values accumulated during a draft session survive sidebar reloads and popout transitions
- **"(live)" label**: Visual indicator lets user distinguish DOM-scraped value from backend-derived value at a glance

## Deviations from Plan

None — plan executed exactly as written. The `Map<number, number>` return type specified in the plan was implemented as a conversion step (`scrapeESPNAuctionTable` returns `Map<number, ESPNAuctionTableEntry>` for richer data, caller extracts the `espnValue` field when writing to store).

## Commits

| Hash | Description |
|------|-------------|
| 0bca97f | feat(quick-35): scrape ESPN auction values from fixedDataTable DOM |

## Self-Check: PASSED

- `packages/extension/lib/dom-observers.ts` — modified, build succeeded
- `packages/extension/lib/draft-state.ts` — modified, build succeeded
- `packages/extension/entrypoints/content.tsx` — modified, build succeeded
- `packages/extension/components/AuctionPlayerCard.tsx` — modified, build succeeded
- `packages/extension/components/DraftSidebar.tsx` — modified, build succeeded
- Build output: `✔ Built extension in 1.193 s` — zero TypeScript errors

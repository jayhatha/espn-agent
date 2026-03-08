---
phase: quick-57
plan: 01
subsystem: extension-engine
tags: [bug-fix, auction-draft, practice-draft, espn-asv]
key-files:
  modified:
    - packages/extension/lib/engine/index.ts
decisions:
  - Build idToName index from all available sources (auctionValues, rankings, allPicks) before resolving espnDomAuctionValues to handle practice drafts where auctionValues is empty
metrics:
  duration: 5min
  completed: 2026-03-08T00:27:43Z
  tasks: 1
  files: 1
---

# Quick Task 57: Fix Expected Market Price Not Using ESPN ASV in Practice Drafts

**One-liner:** Fixed nameToAsv map population by building playerId-to-name index from rankings and allPicks when auctionValues is empty (practice drafts).

## What Was Built

Fixed two `nameToAsv` blocks in `packages/extension/lib/engine/index.ts` that previously only iterated `input.auctionValues` to build the playerId→name lookup used to match ESPN DOM auction values (ASV) to player names. In practice drafts, `auctionValues` is empty so the lookup was always empty, meaning `espnDomAuctionValues` was never applied as market price.

Both blocks (`nameToAsv` and `nameToAsvIdeal`) now build a comprehensive `idToName` map from three sources in priority order:
1. `input.auctionValues` (primary, most reliable)
2. `input.rankings` (bundled FanGraphs data - always populated)
3. `input.allPicks` (DOM-detected picks - populated as draft progresses)

## Changes Made

### `packages/extension/lib/engine/index.ts`

**nameToAsv block (lines 254-282):** Replaced single-source iteration with three-source idToName build + entry guard (`Object.keys(input.espnDomAuctionValues).length > 0`).

**nameToAsvIdeal block (lines 525-550):** Applied the same fix using `idToNameIdeal` as the map variable to avoid name collision with the first block.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- File modified: `packages/extension/lib/engine/index.ts` - FOUND
- Commit `d7830f1` exists
- No new TypeScript errors in `engine/index.ts` (pre-existing errors in other files are unrelated)
- `grep -c "input.rankings" engine/index.ts` = 5 (2 new uses in each nameToAsv block + 1 existing rankingsMap build)

---
phase: 56-auto-bid-cap
plan: 01
subsystem: extension/auto-bid
tags: [auto-bid, espn-asv, auction-draft, extension]
dependency_graph:
  requires: []
  provides: [ESPN-ASV-based bid cap in AutoBidController]
  affects: [packages/extension/lib/auto-bid-controller.ts]
tech_stack:
  added: []
  patterns: [ESPN DOM-scraped value lookup, two-source fallback with nullish coalescing]
key_files:
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - Used state.rankings fallback instead of state.auctionValues because AuctionValue interface lacks espnAuctionValue; DraftRanking has it
metrics:
  duration: 5min
  completed: 2026-03-07
---

# Quick Task 56: Auto-Bid Cap (ESPN ASV +10%) Summary

Replace engine `maxBid` cap with `ceil(espnAsv * 1.10)` cap in `AutoBidController.evaluateAndBid()`, with fallback to `maxBid` when ESPN ASV is unavailable.

## What Was Built

Updated `AutoBidController.evaluateAndBid()` to resolve ESPN's market-price ASV for the currently nominated player and use it as the bid ceiling (inflated by 10%) instead of the engine's SGP-derived `maxBid`. This lets the auto-bidder compete aggressively for anchor players at market rates while preventing overpays beyond 10% above ESPN's own market value.

## Changes Made

### Task 1: Replace maxBid cap with ESPN ASV-based cap

**File:** `packages/extension/lib/auto-bid-controller.ts`

Key changes:
1. Added `playerId` null guard — return early if `currentAuctionPlayer.playerId` is undefined
2. Two-source ESPN ASV resolution:
   - Primary: `state.espnDomAuctionValues[playerId]` (DOM-scraped, most accurate)
   - Fallback: `state.rankings.find(p => p.playerId === playerId)?.espnAuctionValue` (rankings API)
3. `autoBidCap = espnAsv != null ? Math.ceil(espnAsv * 1.10) : maxBid`
4. `capSource` label for both log lines (`ESPN ASV $X +10%` vs `engine maxBid`)
5. Stop-log: `Price $N reached cap $M (ESPN ASV $X +10%) — stopping`
6. Bid-log: `Auto-bidding +1 at $N (cap: $M via ESPN ASV $X +10%)`

**Commit:** 99b7459

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Type correction] Used state.rankings instead of state.auctionValues for ESPN ASV fallback**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified `state.auctionValues?.find(...)?.espnAuctionValue` but the `AuctionValue` interface does not have an `espnAuctionValue` field — it only has `dollarValue` and `vbdScore`. Using it would cause a TypeScript error.
- **Fix:** Used `state.rankings?.find(...)?.espnAuctionValue` instead, since `DraftRanking` has `espnAuctionValue?: number` (set from the ESPN draft board API).
- **Files modified:** packages/extension/lib/auto-bid-controller.ts
- **Commit:** 99b7459

## Self-Check

### Files exist
- `packages/extension/lib/auto-bid-controller.ts` — modified (not created)

### Commits exist
- 99b7459 — feat(56-01): replace maxBid cap with ESPN ASV +10% in AutoBidController

## Self-Check: PASSED

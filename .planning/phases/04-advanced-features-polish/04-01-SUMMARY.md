---
phase: 04-advanced-features-polish
plan: 01
subsystem: draft-assistant
tags: [draft, vbd, sgp, auction, formulas, agents]
dependency_graph:
  requires: [projections, league-settings]
  provides: [vbd-rankings, auction-values, draft-math]
  affects: [draft-recommendations]
tech_stack:
  added: [vbd-formula, sgp-formula, replacement-level-calculation]
  patterns: [component-based-sgp, position-specific-replacement, tier-assignment]
key_files:
  created:
    - packages/shared/src/formulas.ts (VBD/SGP functions)
    - packages/shared/src/types.ts (Draft type definitions)
    - packages/backend/src/agents/draft-rankings.ts
    - packages/backend/src/agents/auction-valuation.ts
  modified: []
decisions:
  - "Population standard deviation for SGP (divide by N, not N-1) since we have complete player pool"
  - "LOWER_BETTER categories (ERA, WHIP) invert SGP calculation for proper ranking"
  - "Multi-position players use maximum VBD across all eligible positions"
  - "Replacement level prorated for shared slots (UTIL=0.2, MI/IF=0.25, CI/OF=0.33 per team)"
  - "Tier assignment: top 10%=tier1, next 15%=tier2, next 25%=tier3, rest=tier4"
  - "Players below replacement level get $1 minimum bid in auctions"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  commits: 2
  completed_at: "2026-02-20T18:54:23Z"
---

# Phase 04 Plan 01: VBD/SGP Draft Mathematics Summary

**One-liner:** VBD and SGP formulas with position-specific replacement levels for draft rankings and auction dollar valuations

## What Was Built

Implemented the mathematical foundation for draft tools using Value Based Drafting (VBD) and Standings Gain Points (SGP) methodologies.

**Shared Formulas (packages/shared/src/formulas.ts):**
- `calculateCategorySGP`: Standard deviation-based standings impact for a single stat
- `calculateTotalSGP`: Sum SGP across all league categories (handles COUNTING, RATE, LOWER_BETTER)
- `getReplacementLevel`: Dynamic calculation of replacement player index by position
- `calculateVBD`: Player SGP minus replacement level SGP
- `calculateSpendingPool`: Total auction budget minus minimum bids
- `calculateAuctionDollarValue`: VBD proportional to spending pool

**Type Definitions (packages/shared/src/types.ts):**
- `DraftRanking`: VBD score, SGP total, category SGPs, tier assignment
- `AuctionValue`: Dollar value, VBD score, inflation adjustment
- `DraftContext`: League settings for draft calculations

**DraftRankingsAgent (packages/backend/src/agents/draft-rankings.ts):**
- Loads player projections from latest fresh run
- Calculates total SGP for all players using league categories
- Groups players by position and sorts by SGP
- Calculates replacement level per position based on roster slots and team count
- Computes VBD for each player (max across all eligible positions)
- Assigns tiers (1-4) based on VBD percentiles
- Returns ranked list sorted by VBD descending

**AuctionValuationAgent (packages/backend/src/agents/auction-valuation.ts):**
- Delegates to DraftRankingsAgent for VBD scores
- Calculates spending pool from league budget and roster size
- Converts VBD to dollar values proportionally
- Players below replacement get minimum bid ($1)
- Sorts by dollar value descending

## Key Implementation Details

**SGP Calculation:**
- For COUNTING stats: Use raw stat value
- For RATE stats: Calculate rate from components using existing formula functions
- LOWER_BETTER categories (ERA, WHIP): Negate SGP so lower values = higher rankings
- Population standard deviation (N not N-1) since we have complete player pool

**Replacement Level Logic:**
- Exact-match positions (C, 1B, SS, etc.): `slots * teams + 1`
- UTIL slots: Prorate by 0.2 per team (mixed usage)
- MI/IF slots: Prorate by 0.25 per team
- CI/OF slots: Prorate by 0.33 per team

**Multi-Position Players:**
- Calculate VBD for each eligible position
- Use maximum VBD (player valued at most valuable slot)
- Store primary position for display purposes

**Auction Math:**
- Spending pool = (budget * teams) - (minBid * rosterSize * teams)
- Total VBD = sum of all positive VBD scores
- Dollar value = (playerVBD / totalVBD) * spendingPool + minBid
- Round to nearest integer, never below minBid

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

✅ `packages/shared/src/formulas.ts` exports all VBD/SGP functions
✅ `packages/shared/src/types.ts` exports DraftRanking, AuctionValue, DraftContext
✅ `packages/backend/src/agents/draft-rankings.ts` exports DraftRankingsAgent with getRankings method
✅ `packages/backend/src/agents/auction-valuation.ts` exports AuctionValuationAgent with getValuations method
✅ TypeScript compiles cleanly in shared package (backend has pre-existing unrelated errors)

## Testing Notes

Both agents ready for integration testing with real projections data. Recommend testing scenarios:
- Single-position vs multi-position players
- Pitcher vs batter VBD differences
- League with different roster slot configurations
- Small leagues (8 teams) vs large leagues (16+ teams)
- Categories with LOWER_BETTER direction

## Self-Check: PASSED

Verified all created files exist and commits are present:

```
✅ packages/shared/src/formulas.ts - modified
✅ packages/shared/src/types.ts - modified
✅ packages/backend/src/agents/draft-rankings.ts - created
✅ packages/backend/src/agents/auction-valuation.ts - created
✅ Commit 25d6c1f - feat(04-01): add VBD/SGP formulas and draft types
✅ Commit 573d1e9 - feat(04-01): create DraftRankingsAgent and AuctionValuationAgent
```

All files present, all commits exist in git history.

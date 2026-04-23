# Phase 57 Context: Fix Auction Simulator

## Decisions (LOCKED)

### Current state
`tools/simulate-auction.ts` exists but doesn't match the live engine. It has partial fixes but the simulation results show broken behavior:
- Catchers filling UTIL slots (should max 1 catcher)
- Bench is all pitchers (should be 2H/3P)
- SP ranking logic not working (mode SPs are all unranked filler)
- $117 unspent budget
- Only $3-5 bids on quality SPs despite $18 tier caps

### What the simulator must match from the live engine

**Bid computation (bid-optimizer.ts + strategy-caps.ts):**
1. SGP-dollar valuation: (playerSGP / totalPoolSGP) × totalLeagueBudget
2. 40/60 SGP/ASV blend: sgpDollars × 0.4 + asv × 0.6
3. SP tier caps based on PL rank (floor AND ceiling for top-60): PL 1-20=$18, 21-30=$12, 31-40=$10, 41-60=$5, 61+=$3
4. SP savings reallocation to future SPs (top-60 only) and RPs (when 5+ SPs)
5. RP hard cap: $15
6. Hitter budget cap: $220
7. Positional need: dedicated/flex=1.0x, UTIL=0.7x, BN=0.5x, elite override at $30
8. Catcher: max 1 (return $0 for pure catcher when C filled)
9. Positional weight: SS+4, OF/3B+3, 1B/2B/DH+2, C+1 (only when dedicated/flex slot open)
10. Position normalization: LF/CF/RF→OF
11. Bench composition: max 2 hitter bench, 3 pitcher bench

**Auction mechanics:**
- Second-price auction (winner pays 2nd-highest + $1)
- 13 teams, $260 budget, 28 slots
- Our nomination: overpriced-first (drain opponent budgets)
- Opponent strategies: market (Gaussian noise around ASV), stars-and-scrubs, bargain, balanced

**NO spending pressure** — the live engine doesn't have it. No artificial bid inflation.

**Data sources:**
- FG player pool from extension assets JSON
- ESPN ASV from combined-draft-values.csv (487 players, fetched by tools/build-combined-csv.ts)
- PitcherList rankings from extension assets JSON (429 pitchers)

### Deliverables
1. Fix `tools/simulate-auction.ts` to match ALL live engine rules
2. Vitest spec target tests
3. Results should show realistic rosters with ranked SPs, proper bench split, budget mostly spent

## Claude's Discretion
- Whether to rewrite simulate-auction.ts from scratch or patch the existing code
- Test structure

## Deferred Ideas
- None

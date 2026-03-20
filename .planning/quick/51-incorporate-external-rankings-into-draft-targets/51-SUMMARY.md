# Quick Task 51: External Rankings in Draft Targets

## Problem
External rankings (PitcherList, CloserMonkey) only influenced scarcity tier-drop calculations. Individual player scoring in top targets and shopping list ignored expert rankings entirely.

## Solution
Added `computeExternalRankBoost()` — a multiplicative factor applied to adjustedSgp in both top targets and shopping list scoring. Players ranked highly by experts get up to 1.6x boost; unranked players get 0.7x penalty.

## Changes
- **rank-boost.ts**: New shared utility with `computeExternalRankBoost()` formula
- **engine/index.ts**: Build `nameToExternalRank` map from rankings, apply boost in top targets, pass to shopping list
- **shopping-list.ts**: Accept and apply external rank boost in candidate scoring

## Formula
- Ranked: `1.0 + 0.6 * (1.0 - rank / 200)` — rank 1 = 1.6x, rank 100 = 1.3x, rank 200 = 1.0x
- Unranked: 0.7x (30% penalty)

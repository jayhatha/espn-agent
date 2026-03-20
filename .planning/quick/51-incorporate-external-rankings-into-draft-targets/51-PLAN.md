---
quick_task: 51
description: "Incorporate external rankings strongly into draft targets math"
---

# Quick Task 51: External Rankings in Draft Targets

## Problem
External rankings (PitcherList, CloserMonkey) exist on `DraftRanking.externalRank` but only influence scarcity tier-drop calculations. They do NOT affect individual player scoring in top targets or shopping list — a player ranked #5 by PitcherList gets the same adjustedSgp as one ranked #150.

## Solution
Apply a rank-based multiplier to adjustedSgp in both top targets and shopping list scoring. Players with high external rankings get a significant boost; unranked players get a penalty.

**Formula:**
```
For ranked players (externalRank exists):
  rankBoost = 1.0 + WEIGHT * (1.0 - rank / MAX_RANK)
  Where: WEIGHT = 0.6, MAX_RANK = 200
  rank 1 → 1.6x, rank 50 → 1.45x, rank 100 → 1.3x, rank 200 → 1.0x

For unranked players:
  rankBoost = 0.7 (30% penalty)
```

## Tasks

### Task 1: Build nameToExternalRank map and apply boost in top targets
**File:** `packages/extension/lib/engine/index.ts`
**Action:**
- In `computeRosterOptimization`, build `nameToExternalRank` map from `input.rankings`
- Apply `computeExternalRankBoost()` as a multiplicative factor on adjustedSgp in the `indexedAll` scoring block (line ~353-373)
- Pass `nameToExternalRank` to `computeShoppingList`

### Task 2: Apply external rank boost in shopping list
**File:** `packages/extension/lib/engine/shopping-list.ts`
**Action:**
- Accept `nameToExternalRank?: Map<string, number>` in params
- Apply same `computeExternalRankBoost()` to adjustedSgp in candidate scoring (step b)
- Extract shared boost function or inline it

## Verification
- Players with low external ranks (top 30) should consistently appear in top targets
- Unranked players should be significantly deprioritized
- No new TypeScript errors

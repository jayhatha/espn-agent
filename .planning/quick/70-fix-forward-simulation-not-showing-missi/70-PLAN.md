# Quick Task 70: Fix forward simulation not showing

## Problem
The forward simulation (win probability, decision comparison, draft targets, nomination strategy) never displays in the sidebar because of a missing `else` clause in the simulation cache logic.

In `packages/extension/lib/engine/index.ts`, the simulation gate at line 1040 checks `if (draftProgressFraction >= 0.05)`. When draft progress is < 5%, the code falls through without updating `simulationCacheKey`, causing:
1. Every subsequent render re-evaluates the same condition (cache key never matches)
2. `cachedSimulation` remains null permanently
3. The worker never fires even after draft passes 5% because the cache key race prevents stable evaluation

## Fix
Add `else` clause after the `if (draftProgressFraction >= 0.05)` block to update `simulationCacheKey = newSimCacheKey` when below threshold. This prevents the infinite re-evaluation loop and allows the simulation to fire properly once the 5% threshold is crossed.

## Files
- `packages/extension/lib/engine/index.ts` — add else clause with cache key update

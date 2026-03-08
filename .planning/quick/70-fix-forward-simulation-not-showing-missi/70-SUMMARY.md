# Quick Task 70: Summary

## What was done
Fixed the forward simulation (win probability) not displaying in the extension sidebar.

## Root cause
Missing `else` clause in `packages/extension/lib/engine/index.ts` at the simulation draft progress gate. When `draftProgressFraction < 0.05`, the code fell through without updating `simulationCacheKey`, causing every render to re-evaluate the gate condition. The cache key never stabilized, preventing the worker from firing even after draft progress exceeded 5%.

## Fix
Added `else { simulationCacheKey = newSimCacheKey; }` after the `if (draftProgressFraction >= 0.05)` block. Now when draft is < 5%, the cache key is updated to prevent repeated evaluation, and once the threshold is crossed, the simulation fires properly.

## Files changed
- `packages/extension/lib/engine/index.ts` — added else clause with cache key update and DEV log

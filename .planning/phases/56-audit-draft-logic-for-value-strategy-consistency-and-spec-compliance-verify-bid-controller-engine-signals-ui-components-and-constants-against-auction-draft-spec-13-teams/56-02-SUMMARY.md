---
phase: 56-audit-draft-logic
plan: 02
status: done
---

# 56-02 Summary: Consolidate nomination scoring, verify BidVerdict async merge

## What changed

### Task 1: Consolidated nomination scoring into single path

**nomination-strategy.ts** — Extracted `computeNominationScore()` as a standalone exported function that implements the weighted formula: `normalizedOverpricing * 0.6 + opponentNeedFactor * 0.2 + myNonNeedFactor * 0.2`. Both `recommendNomination()` (full engine path) and the auto-bid controller now call this shared function.

**auto-bid-controller.ts** — Replaced inline `espnPrice - modelValue` nomination scoring in the early/mid draft path with a call to `computeNominationScore()` from `nomination-strategy.ts`. The controller passes:
- ESPN price and model value for the overpricing factor (60% weight)
- Neutral 0.5 for opponent need factor (controller lacks full opponent state data)
- Computed myNonNeedFactor based on `remainingSlots` from engine signals (0.0 if position still needed, 1.0 if filled)

The endgame nomination paths (own targets and filler) were left unchanged — they use different scoring strategies (value/$ and cheapest-first) that are intentionally distinct from the overpricing formula.

### Task 2: BidVerdict audit (no code changes needed)

Verified the async merge pipeline is correct:

1. **`use-draft-engine.ts`** — `asyncBid` state holds worker response. Merge logic (lines 110-120) overwrites `maxBid`, `shouldBid`, `simulationEV`, `expectedMarketPrice`, `valueSurplus` from the async worker result. `computeStrategyBidCap` is applied after merge (lines 123-158), producing `cappedMaxBid = Math.min(mergedOptimization.maxBid, capResult.bidCap)`.

2. **`BidVerdict.tsx`** — Reads `optimization.maxBid` and `optimization.shouldBid` from `engineSignals` prop (line 17), which is the merged/capped output from `useDraftEngineSignals()`. Does not read directly from sync engine output.

3. **Async reset** — `useEffect` (lines 45-48) resets `asyncBid` and `asyncSimulation` to null when `allPicks.length`, `currentPlayerId`, or `currentPlayerName` changes. This prevents stale values across nominations.

Conclusion: BidVerdict correctly displays strategy-capped maxBid from async worker; shouldBid reflects simulation-based EV; no issues found.

## Verification

- `grep "espnPrice - modelValue" auto-bid-controller.ts` — no matches (removed)
- `grep "import.*nomination-strategy" auto-bid-controller.ts` — import exists (line 5)
- `npx tsc --noEmit` — no new errors (pre-existing errors unchanged)
- `npx vitest run` — 246 tests pass (17 test files)

## Files modified

- `packages/extension/lib/engine/nomination-strategy.ts` — added `computeNominationScore()` export; refactored `recommendNomination()` to use it
- `packages/extension/lib/auto-bid-controller.ts` — import `computeNominationScore`; replaced inline scoring with shared function call; updated comments

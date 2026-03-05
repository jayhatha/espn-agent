---
phase: quick-42
plan: 01
subsystem: extension-engine
tags: [bid-optimizer, market-price, cap, auction-draft]
dependency_graph:
  requires: []
  provides: [estimateMarketPrice-2x-cap]
  affects: [bid-optimizer.ts, engine/index.ts, top-targets]
tech_stack:
  added: []
  patterns: [dollar-value-cap, defense-in-depth]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/opponent-model.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/engine/bid-optimizer.ts
    - packages/extension/lib/__tests__/opponent-model.test.ts
decisions:
  - "2x dollar value cap applied in estimateMarketPrice itself (not just call sites) so all callers automatically benefit from the guard"
  - "Defense-in-depth: top targets maxBid independently capped to min(myBudget, expectedPrice, 2x dollarValue) even though expectedPrice is already capped"
  - "Binary search upper bound in bid-optimizer (3x) intentionally unchanged — user is actively bidding on the nominated player and needs the full range; 2x cap affects expected market price (what opponents pay), not max profitable bid"
  - "playerDollarValue 5th parameter required (not optional) to make all callers explicit about the cap context"
metrics:
  duration: 2min
  completed: 2026-03-05
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 42: Fix Inflated Max Bid Recommendations Summary

**One-liner:** 2x dollar value cap in estimateMarketPrice prevents SGP-ratio-driven runaway prices for low-value players (e.g. $1 player capped at $2 instead of $30+).

## What Was Built

Added a `playerDollarValue` 5th parameter to `estimateMarketPrice` in `opponent-model.ts` that clamps the output to `max(1, ceil(dollarValue * 2.0))`. This prevents the SGP-share formula from producing absurd market price estimates for low-value players with favorable budget/SGP ratios.

### Root Cause

`estimateMarketPrice` computes: `playerSGP * (totalRemainingBudget / totalRemainingValue)`. For a $1 player with above-average SGP (e.g. SGP=5) and a high budget/SGP ratio (e.g. 600/100=6), this produces $30. The resulting `maxBid` recommendation was nonsensical — telling users to bid $30 on a player with a pre-draft value of $1.

### Fix Applied

- `estimateMarketPrice` now accepts `playerDollarValue: number` as a 5th required parameter
- After computing the raw price, clamps: `Math.min(raw, Math.max(1, Math.ceil(playerDollarValue * 2.0)))`
- The 2x multiplier allows real draft inflation (players commonly go for 1.5-2x their dollar value) while preventing runaway estimates
- Top targets `maxBid` in `index.ts` also independently capped as defense-in-depth: `Math.min(myBudget, expectedPrice, Math.max(1, Math.ceil(player.dollars * 2.0)))`
- All 4 call sites updated: 1 in `index.ts`, 3 in `bid-optimizer.ts`

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add playerDollarValue cap to estimateMarketPrice, update all callers | 64364f1 |
| 2 | Update tests for 5th param + add 3 new 2x cap verification tests | 3426b59 |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit`: No errors from changed files (pre-existing errors in unrelated WXT/API files)
- `npx vitest run lib/__tests__/opponent-model.test.ts`: 15/15 tests pass
- Manual sanity: `estimateMarketPrice(5, 100, 600, 0, 1)` = 2 (was 30); `estimateMarketPrice(10, 100, 300, 0, 5)` = 10 (was 30)

## Self-Check: PASSED

Files verified:
- packages/extension/lib/engine/opponent-model.ts — FOUND, contains 5-param signature and 2x clamp
- packages/extension/lib/engine/index.ts — FOUND, passes player.dollars at estimateMarketPrice call site
- packages/extension/lib/engine/bid-optimizer.ts — FOUND, all 3 call sites pass nominatedPlayer.dollars
- packages/extension/lib/__tests__/opponent-model.test.ts — FOUND, 15 tests pass

Commits verified:
- 64364f1 — Task 1 feat commit
- 3426b59 — Task 2 test commit

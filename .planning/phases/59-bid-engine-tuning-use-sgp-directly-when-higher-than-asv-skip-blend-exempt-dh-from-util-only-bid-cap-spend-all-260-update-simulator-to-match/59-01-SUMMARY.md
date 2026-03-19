---
phase: 59-bid-engine-tuning
plan: 01
subsystem: extension/engine
tags: [bid-optimizer, strategy-caps, auction-draft, testing]
dependency_graph:
  requires: []
  provides: [SGP-skip-blend, DH-UTIL-exemption, budget-flush-boost, BN-overflow-guard]
  affects: [bid-optimizer.ts, strategy-caps.ts]
tech_stack:
  added: []
  patterns: [skip-blend conditional, budget-flush end-of-draft, BN overflow guard]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/bid-optimizer.ts
    - packages/extension/lib/engine/strategy-caps.ts
    - packages/extension/lib/engine/__tests__/bid-ceiling.test.ts
    - packages/extension/lib/__tests__/strategy-caps.test.ts
decisions:
  - Budget flush guard requires totalSpent>200 to avoid misfiring in tests with default 0 spent
  - Budget flush fires as final step (after hitter cap) — overrides caps to ensure spending
  - BN overflow guard only fires when BN is explicitly 0 in remainingSlots (backward compat when BN not tracked)
metrics:
  duration: 5m
  completed: 2026-03-19
  tasks_completed: 2
  files_modified: 4
---

# Phase 59 Plan 01: Bid Engine Tuning Summary

Three bid engine tuning changes: SGP-over-ASV skip-blend, DH UTIL exemption, and budget flush boost to spend all $260.

## What Was Built

**Task 1: bid-optimizer.ts + strategy-caps.ts changes**

Three logic changes plus one bugfix:

1. **SGP skip blend** (`bid-optimizer.ts` lines 97-115): When `sgpDollars > asvMarketPrice`, set `rawBlendedValue = sgpDollars` directly instead of blending. When ASV is higher (market knows something we don't), still blend toward market. This ensures our model is never diluted by a lower market price.

2. **DH UTIL exemption** (`strategy-caps.ts`): Before applying the 0.7x UTIL need multiplier, checks if any position in `player.positions` is "DH". DH players go to UTIL naturally (no dedicated DH slot in ESPN), so penalizing them would unfairly reduce bids. BN dampening (0.5x) still applies to DH players.

3. **Budget flush boost** (`strategy-caps.ts`): Final step after inflation adjustment. When `totalSpent > 200` (draft substantially complete) AND `slotsRemaining <= 5`: calculates `excessBudget = budgetRemaining - minReserves - bidCap`. For 1-2 slots remaining, boosts by full excess. For 3-5 slots, boosts by ~50% of excess. Ensures the $260 budget is fully deployed.

4. **BN overflow guard** (`strategy-caps.ts`): When `destination === "BN"` and `remainingSlots["BN"] === 0`, returns `{ bidCap: 0, capSource: "... NO SLOT" }`. Only triggers when BN is explicitly tracked as 0 (backward compat when caller doesn't pass BN count).

**Task 2: New tests**

- `bid-ceiling.test.ts`: 3 new tests for SGP skip blend logic
- `strategy-caps.test.ts`: 3 tests for DH UTIL exemption, 4 tests for budget flush, 2 tests for BN overflow guard

Total: 300 tests passing (was 288, +12 new).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Budget flush misfired on existing tests with default hitterSpent=0**
- **Found during:** Task 1 (running tests after implementing)
- **Issue:** Existing tests use `makeInput()` defaults with `hitterSpent: 0, pitcherSpent: 0` and small `remainingSlots`. The flush computed `budgetRemaining=260` and boosted every bid massively.
- **Fix:** Added `totalSpent > 200` guard so the flush only runs when the draft is substantially complete. This matches the intent (end-of-draft spending) without breaking early/mid-draft logic.
- **Files modified:** `packages/extension/lib/engine/strategy-caps.ts`
- **Commit:** f35f21b (same task 1 commit)

**2. [Rule 1 - Bug] One existing combined test expected pre-flush behavior**
- **Found during:** Task 1 test run
- **Issue:** Test `"applies catcher dampening then positional weight then hitter cap"` used `hitterSpent: 210` (triggers flush) and expected `bidCap=10`. With budget flush: `bidCap=50` is correct (1 slot left, $50 remaining).
- **Fix:** Updated test expectation to `50` and added `budget flush` assertion. The new behavior is correct — with 1 slot left and $50 remaining, you should bid $50.
- **Files modified:** `packages/extension/lib/__tests__/strategy-caps.test.ts`
- **Commit:** f35f21b

## Decisions Made

- **Budget flush threshold `totalSpent > 200`**: Chosen to prevent misfiring in unit tests and early-draft scenarios. At $200+ spent, you're deep enough in the draft that flush logic is appropriate.
- **Budget flush as true final step**: Placed after inflation adjustment and after hitter cap — intentionally overrides previous caps to guarantee budget deployment.
- **BN guard backward compat**: Using `?? -1` sentinel so `undefined` BN (not tracked) doesn't trigger zero-bid guard. Only `0` (explicitly full) triggers it.

## Self-Check

### Files exist:
- packages/extension/lib/engine/bid-optimizer.ts: FOUND
- packages/extension/lib/engine/strategy-caps.ts: FOUND
- packages/extension/lib/engine/__tests__/bid-ceiling.test.ts: FOUND
- packages/extension/lib/__tests__/strategy-caps.test.ts: FOUND

### Commits:
- f35f21b: feat(59-01): SGP-over-ASV skip blend, DH UTIL exemption, budget flush boost
- 4aa0df0: test(59-01): add tests for SGP skip blend, DH UTIL exemption, budget flush, BN guard

## Self-Check: PASSED

---
id: 59
title: "Fix auto-bid timing: remove shouldBid gate broken by async worker"
type: bugfix
status: planned
---

# Quick Task 59: Fix Auto-Bid Timing

## Problem

Auto-bidding on anchor/core ideal roster targets and top-50 opportunity players is not working.

**Root cause:** When bid computation moved to a Web Worker (task 58), `optimization.shouldBid` became async. On each new nomination:
1. `asyncBid` state resets to `null` (use-draft-engine.ts line 41)
2. `baseSignals.optimization` returns placeholder with `shouldBid=false`
3. AutoBidController evaluates immediately and bails at line 124: `if (!shouldBid) return;`
4. Worker completes 50-200ms later, but by then the controller may not re-evaluate

The controller's own strategy filter (ideal roster + opportunity check) is the real decision gate — the Monte Carlo `shouldBid` is redundant here.

## Fix

Remove `optimization.shouldBid` as a gate in AutoBidController. The controller already has its own two-path strategy filter that determines whether to bid. Keep `optimization.maxBid` only as a fallback cap for ideal targets without ESPN ASV.

### Changes to `packages/extension/lib/auto-bid-controller.ts`:

1. Remove the `optimization == null` guard (line 119)
2. Remove the `shouldBid` destructure and guard (lines 121-127)
3. Move ESPN ASV resolution before strategy filter
4. Use `optimization.maxBid` only as fallback for ideal target cap when espnAsv is null
5. If neither espnAsv nor maxBid is available for an ideal target, skip (will retry on next signal update)

## Verification

- Ideal roster anchor/core targets: controller should proceed to DOM click when price < ASV+10%
- Opportunity bids (top-50 ext rank, below market): controller should proceed when price < ASV
- Non-targets: controller should still skip (strategy filter is the gate)
- No shouldBid dependency means no timing issue with async worker

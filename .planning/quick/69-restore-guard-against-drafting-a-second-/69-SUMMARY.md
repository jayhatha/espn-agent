---
phase: quick-69
plan: 01
subsystem: extension
tags: [auto-bid, catcher, position-slots, dampening]
dependency_graph:
  requires: []
  provides: [remainingSlots in DraftEngineSignals, catcher-slot dampening in auto-bid]
  affects: [auto-bid-controller, engine signals]
tech_stack:
  added: []
  patterns: [multiplicative dampening after bid cap computation]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - "Dampening (0.5x) instead of hard block: user wants to be able to draft second catchers for UTIL/BN, just not overpay"
  - "Catcher-only dampening: C is the only 1-slot position that commonly causes overvaluation issues"
  - "Dampening applied after bid cap computation and after pitcher dampening, multiplicatively"
  - "Fail-open: when remainingSlots not yet available, no dampening applied"
metrics:
  duration: 8min
  completed: 2026-03-07
---

# Quick Task 69: Catcher Slot Dampening for Auto-Bid Summary

One-liner: Expose `remainingSlots` from draft engine and apply 0.5x bid cap dampening when the dedicated C slot is already filled.

## What Was Built

### Task 1: Expose `remainingSlots` in DraftEngineSignals

Added `remainingSlots: Record<string, number>` to the `DraftEngineSignals` interface in `types.ts`. The variable `remainingSlotsOpt` was already computed in `engine/index.ts` (line ~829) — it represents unfilled slots with zero-count entries removed — and is now included in the return object.

### Task 2: Catcher Slot Dampening in Auto-Bid Controller

After the bid cap is computed (and after pitcher dampening), a catcher-specific dampening check runs:

1. Check `ranking?.primaryPosition === 'C'`
2. Read `this.lastEngineSignals?.remainingSlots?.['C'] ?? 0`
3. If `catcherSlotsRemaining <= 0`, apply `autoBidCap * 0.5` (minimum $1)
4. Log: `[AutoBidController] C slot filled — catcher dampening applied (0.5x): $X → $Y`

This prevents the auto-bid from overpaying for a second catcher who can only go to UTIL/BN, while still allowing the bid to proceed.

## Deviations from Plan

### Override by User Clarification

**Task 2 modified:** The original plan called for a hard block (`return`) when all dedicated slots for a position are filled. The user clarified that the desired behavior is dampening, not blocking — specifically for catchers going to UTIL/BN.

**Change made:** Instead of the position-slot guard with `return`, applied a 0.5x dampening multiplier to `autoBidCap` when the player's primary position is `C` and `remainingSlots['C']` is 0 or absent. The broader multi-position guard (CI/MI combo slots, all positions) was not implemented per the override.

## Self-Check: PASSED

- FOUND: packages/extension/lib/engine/types.ts
- FOUND: packages/extension/lib/engine/index.ts
- FOUND: packages/extension/lib/auto-bid-controller.ts
- FOUND commit d5bb77b: feat(69-01): expose remainingSlots in DraftEngineSignals and engine return
- FOUND commit 0b35fc7: feat(69-02): apply catcher dampening when C slot is full

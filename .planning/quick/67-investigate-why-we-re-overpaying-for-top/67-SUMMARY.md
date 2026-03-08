---
phase: 67-fix-pitcher-dampening-auto-bid
plan: 01
subsystem: extension/auto-bid-controller
tags: [auto-bid, pitcher-dampening, draft-engine, extension]
dependency_graph:
  requires: [pitcherHitterSplit-slider, draft-state-store]
  provides: [pitcher-dampened-auto-bid-caps]
  affects: [AutoBidController.evaluateAndBid]
tech_stack:
  added: []
  patterns: [zustand-store-read, pitcher-multiplier-formula]
key_files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - "Read pitcherHitterSplit directly from state already available at top of evaluateAndBid() — no new store subscription needed"
  - "Apply dampening after autoBidCap is fully computed (after the IDEAL/PL-UNDERVALUED/OPPORTUNITY if-else chain) so all three paths are covered uniformly"
  - "Use Math.max(1, ...) floor to ensure pitcher caps never drop below $1 even at extreme slider values"
metrics:
  duration: 4min
  completed: 2026-03-08T06:11:25Z
  tasks: 1
  files: 1
requirements: [PITCHER-DAMPEN-01]
---

# Quick Task 67: Fix Pitcher Dampening in Auto-Bid Controller

Auto-bid caps for SP/RP players are now reduced by the pitcher dampening multiplier derived from the pitcherHitterSplit slider, matching the formula already used in the SGP engine.

## What Was Built

The `AutoBidController.evaluateAndBid()` method previously computed auto-bid caps using raw ESPN ASV-based multipliers (ASV +10% for IDEAL, ASV +15% for PL UNDERVALUED, ASV at market for OPPORTUNITY) without any awareness of the pitcher/hitter balance slider. This caused the controller to systematically overpay for starting pitchers when the slider was set above 50 (the typical 65 default).

The fix adds pitcher dampening as a post-processing step after the bid cap is computed for any of the three bid paths:

```typescript
const pitcherHitterSplit = state.pitcherHitterSplit ?? 65;
if (isPitcher) {
  const pitcherMultiplier = (100 - pitcherHitterSplit) / 50;
  const rawCap = autoBidCap;
  autoBidCap = Math.max(1, Math.ceil(autoBidCap * pitcherMultiplier));
  capSource += ` → pitcher dampened ×${pitcherMultiplier.toFixed(2)} = $${autoBidCap} (raw $${rawCap})`;
}
```

`isPitcher` is derived from `isSP || isRP` (both new `isRP` and existing `isSP` variables).

## Math Verification (ASV=$20 SP at split=65, multiplier=0.7)

| Path | Raw Cap | After Dampening |
|------|---------|-----------------|
| IDEAL TARGET (ASV +10%) | $22 | $16 (ceil(22 * 0.7)) |
| PL UNDERVALUED (ASV +15%) | $23 | $17 (ceil(23 * 0.7)) |
| OPPORTUNITY (ASV) | $20 | $14 (ceil(20 * 0.7)) |
| Hitter (any path) | unchanged | unchanged |
| SP at split=50 (multiplier=1.0) | unchanged | unchanged |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7467920 | feat(67-01): apply pitcher dampening multiplier to auto-bid caps |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `packages/extension/lib/auto-bid-controller.ts` modified and contains `pitcherMultiplier`, `isPitcher`, `pitcher dampened`
- Commit `7467920` exists in git log
- No TypeScript errors introduced in `auto-bid-controller.ts`

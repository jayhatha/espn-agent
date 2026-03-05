---
phase: quick-43
plan: 01
subsystem: extension-draft-engine
tags: [draft-engine, positional-need, top-targets, sgp, auction-draft]
dependency_graph:
  requires: [packages/extension/lib/engine/index.ts]
  provides: [positional need weighting in top targets sort]
  affects: [computeRosterOptimization, top targets section of DraftSidebar]
tech_stack:
  added: []
  patterns: [positional need boost multiplier, greedy slot assignment reuse]
key_files:
  modified:
    - packages/extension/lib/engine/index.ts
decisions:
  - "needByPosition hoisted outside bid cache block so it is in scope for top targets sort on both cache-hit and cache-miss paths"
  - "50% boost per empty slot (adjustedSgp = sgp * (1 + maxNeed * 0.5)) chosen per plan spec"
  - "UTIL, P, BN excluded from positional need — these are catch-all/pitcher slots, not position-specific needs"
  - "CI/MI combo keys expanded to constituent positions then deleted — player positions are 1B/3B/2B/SS not CI/MI"
  - "Raw sgp used in sgpValue display field — boost only affects sort order, not displayed values"
metrics:
  duration: 2min
  completed: 2026-03-05
  tasks: 1
  files: 1
---

# Quick Task 43: Top Targets Positional Need Weighting Summary

One-liner: Positional need boost (50% per empty slot) applied to top targets SGP sort using existing greedy slot assignment, with CI/MI expansion, preserving raw SGP display values.

## What Was Built

Added positional need weighting to the top targets section of `computeRosterOptimization` in `packages/extension/lib/engine/index.ts`.

### Implementation Details

**needByPosition computation** (after greedy slot assignment):
- Iterates `remainingSlots` (already computed from `myRoster` via `findBestSlotForPositions`)
- Excludes UTIL, P, and BN slots — these are not position-specific needs
- Expands CI combo slot to apply need to both 1B and 3B
- Expands MI combo slot to apply need to both 2B and SS
- Removes CI/MI keys since player positions are real positions (1B, 3B, 2B, SS)

**adjustedSgp computation** (in indexedAll mapping):
```ts
const maxNeed = p.positions.reduce((max, pos) => {
  const posUpper = pos.toUpperCase();
  return Math.max(max, needByPosition[posUpper] ?? 0);
}, 0);
const adjustedSgp = sgp * (1 + maxNeed * 0.5);
```

**Sort change**: hitterPool and pitcherPool both sort by `adjustedSgp` (was `sgp`).

**Display unchanged**: `sgpValue: Math.round(sgp * 100) / 100` — raw SGP, not adjusted.

**Scope fix**: `remainingSlots` and `needByPosition` hoisted from inside the `else` (cache-miss) block to function scope, before the bid cache check. This ensures `needByPosition` is available for the top targets sort on both cache-hit and cache-miss paths.

## Behavior

- Team with 0 1B drafted: 1B players get 1.5x SGP multiplier in sort (needByPosition['1B'] = 1 → boost = 1 + 1*0.5 = 1.5)
- Team with CI slot unfilled: both 1B and 3B players get boosted
- Team fully stocked at all positions: no boost (maxNeed = 0, multiplier = 1.0x)
- UTIL, P, BN never contribute to positional need
- Displayed SGP values in sidebar are unchanged

## Deviations from Plan

**1. [Rule 1 - Bug] Hoisted remainingSlots/needByPosition outside bid cache block**
- Found during: Task 1, after implementing needByPosition inside the else block
- Issue: `needByPosition` declared inside the `else { ... }` bid cache miss block would be undefined when the cache was hit (cache-hit path goes to `if` branch, skipping `else`), causing the top targets sort to use 0 need for all players on cache-hit renders
- Fix: Moved both `remainingSlots` and `needByPosition` computations to function scope, before the `if (newBidCacheKey === bidCacheKey ...)` check. `remainingSlots` is still passed to `computeMaxBid` and `runMonteCarlo` inside the else block unchanged.
- Files modified: packages/extension/lib/engine/index.ts
- Commit: be22ca7

## Self-Check: PASSED

- [x] packages/extension/lib/engine/index.ts modified with needByPosition and adjustedSgp
- [x] Commit be22ca7 exists in git log
- [x] TypeScript: no errors in lib/engine/index.ts (npx tsc --noEmit shows 0 errors from this file)
- [x] needByPosition derived from existing remainingSlots (no duplicate greedy assignment)
- [x] UTIL, P, BN excluded from need calculation
- [x] CI expands to 1B+3B, MI expands to 2B+SS
- [x] sgpValue display uses raw sgp not adjustedSgp

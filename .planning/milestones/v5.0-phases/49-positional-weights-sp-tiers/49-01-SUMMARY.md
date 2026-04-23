---
phase: 49-positional-weights-sp-tiers
plan: "01"
subsystem: engine
tags: [auction, bidding, positional-scarcity, pitcher-tiers, draft-strategy]

requires:
  - phase: auto-bid-controller
    provides: bid cap computation with pitcher dampening and catcher dampening
provides:
  - positional weight bid bonuses for scarce hitting positions
  - SP tier caps limiting pitcher spending by draft order
  - GS cap awareness logging for deep SP picks
affects: [auto-bid-controller, draft-strategy]

tech-stack:
  added: []
  patterns: [layered bid cap adjustments with logged capSource chain]

key-files:
  created:
    - packages/extension/lib/engine/draft-constants.ts
  modified:
    - packages/extension/lib/auto-bid-controller.ts

key-decisions:
  - "Positional weights added AFTER pitcher/catcher dampening so they apply to the dampened value"
  - "SP tier caps use min(autoBidCap, tierCap) to never exceed tier limit"
  - "GS cap awareness is advisory logging only — tier caps already enforce spending limits"

patterns-established:
  - "draft-constants.ts as centralized home for draft strategy constants"

requirements-completed: [POS-01, POS-02, POS-03]

duration: 2min
completed: 2026-03-15
---

# Phase 49 Plan 01: Positional Weights & SP Tiers Summary

**Positional bid bonuses (SS +4, OF +3, 3B +3) boost scarce-position ceilings; SP tier caps ($18/$12/$10/$5/$3) limit pitcher spending; 200 GS cap advisory logged for SP4+**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T23:30:02Z
- **Completed:** 2026-03-15T23:32:09Z
- **Tasks:** 5
- **Files modified:** 2

## Accomplishments

- Created draft-constants.ts with POSITIONAL_WEIGHTS, SP_TIER_CAPS, GS_CAP, and helper functions
- Applied positional weight bonus to auto-bidder after existing dampening chain
- Applied SP tier caps that clamp bid ceiling based on drafted SP count
- Added GS cap awareness logging for SP4+ evaluations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add constants file** - `b08e0ca` (feat)
2. **Tasks 2-4: Apply weights, tier caps, GS cap to auto-bidder** - `2ad4529` (feat)
3. **Task 5: Build verification** - verified as part of task 2-4 commit (build passed)

## Files Created/Modified

- `packages/extension/lib/engine/draft-constants.ts` - Constants and helpers for positional weights, SP tier caps, GS cap
- `packages/extension/lib/auto-bid-controller.ts` - Import constants; apply positional weight bonus, SP tier cap, and GS cap logging after existing dampening

## Decisions Made

- Applied positional weights AFTER pitcher/catcher dampening so the bonus is additive on the dampened base, not inflated by the raw cap
- SP tier caps use Math.min to clamp — the tier cap is a hard ceiling regardless of other adjustments
- GS cap awareness is informational logging only since the tier caps already enforce the spending discipline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Positional weights and SP tier caps active in auto-bidder
- Constants centralized in draft-constants.ts for reuse by other engine modules
- Ready for further draft strategy refinements

## Self-Check: PASSED

- [x] draft-constants.ts exists
- [x] Commit b08e0ca found (constants)
- [x] Commit 2ad4529 found (auto-bidder integration)
- [x] SUMMARY.md exists
- [x] PLAN.md exists
- [x] Extension build passes

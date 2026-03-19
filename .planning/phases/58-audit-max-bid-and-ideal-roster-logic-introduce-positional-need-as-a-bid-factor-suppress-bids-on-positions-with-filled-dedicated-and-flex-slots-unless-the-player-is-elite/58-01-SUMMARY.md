---
phase: 58-audit-max-bid-and-ideal-roster-logic
plan: 01
subsystem: engine
tags: [auction, bid-caps, positional-need, strategy]

requires:
  - phase: 55-extension-draft-reliability
    provides: strategy-caps.ts bid cap pipeline
provides:
  - determineSlotDestination function for positional need classification
  - Need multiplier in computeStrategyBidCap (UTIL 0.7x, BN 0.5x, elite bypass)
  - BidVerdict stat pills showing slot destination status
affects: [draft-engine, auto-bid-controller, bid-verdict-ui]

tech-stack:
  added: []
  patterns: [need-multiplier-before-positional-weight, elite-threshold-bypass]

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/strategy-caps.ts
    - packages/extension/lib/__tests__/strategy-caps.test.ts
    - packages/extension/components/BidVerdict.tsx

key-decisions:
  - "Need multiplier applied after catcher dampening, before positional weight bonus"
  - "Elite threshold set at $30 rawMaxBid -- players above this always bid at full value regardless of slot destination"
  - "Pitcher need check uses P slots only -- pitchers never go to UTIL"

patterns-established:
  - "Slot destination classification: dedicated > flex (MI/CI) > UTIL > BN"
  - "Elite override pattern: high-value players skip structural reductions"

requirements-completed: [NEED-01, NEED-02]

duration: 3min
completed: 2026-03-18
---

# Phase 58 Plan 01: Positional Need Multiplier Summary

**Positional need bid suppression: UTIL-bound 0.7x, bench-bound 0.5x, elite ($30+) bypass, with colored stat pills in BidVerdict**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T05:12:42Z
- **Completed:** 2026-03-19T05:15:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `determineSlotDestination()` function classifying players into dedicated/flex/UTIL/BN based on remaining roster slots
- Integrated need multiplier into `computeStrategyBidCap` pipeline: 1.0x for dedicated/flex, 0.7x for UTIL, 0.5x for BN
- Elite players (rawMaxBid >= $30) bypass need reduction entirely
- Added colored stat pills in BidVerdict: yellow "UTIL slot", red "Bench only", green "Elite override"
- 14 new tests covering all need multiplier scenarios (41 total tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add need multiplier to strategy-caps.ts** - `e29059a` (feat)
2. **Task 2: Show need factor in BidVerdict debug panel** - `e9e57ab` (feat)

## Files Created/Modified
- `packages/extension/lib/engine/strategy-caps.ts` - Added determineSlotDestination + need multiplier in computeStrategyBidCap
- `packages/extension/lib/__tests__/strategy-caps.test.ts` - 14 new tests for need multiplier and determineSlotDestination
- `packages/extension/components/BidVerdict.tsx` - Colored stat pills for UTIL/BN/elite override

## Decisions Made
- Need multiplier placed after catcher dampening, before positional weight bonus -- this means catcher dampening stacks with need (intentional: filled C slot + UTIL = double reduction)
- Elite threshold at $30 rawMaxBid -- matches typical "star player" price point
- Pitcher slot check only uses P slots (pitchers cannot go to UTIL in ESPN leagues)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated combined adjustment tests to include remainingSlots**
- **Found during:** Task 1
- **Issue:** Existing combined adjustment tests did not provide remainingSlots, which would have caused the need multiplier to be skipped (backward compat) but tests were more accurate with explicit slot data
- **Fix:** Added remainingSlots to the three combined adjustment test cases with appropriate slot configurations
- **Files modified:** packages/extension/lib/__tests__/strategy-caps.test.ts
- **Verification:** All 41 tests pass
- **Committed in:** e29059a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor test data enhancement for accuracy. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in api-client.ts, auto-bid-controller.ts, draft-state.ts, and wxt.config.ts -- unrelated to this plan's changes, out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Need multiplier is live in strategy-caps pipeline
- Auto-bid controller and sidebar will automatically use the new multiplier since they call computeStrategyBidCap
- Extension builds successfully

---
*Phase: 58-audit-max-bid-and-ideal-roster-logic*
*Completed: 2026-03-18*

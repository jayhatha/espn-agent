---
phase: 64-dynamic-budget-allocation-recalculate-ideal-team-to-spend-all-260-bid-up-on-board-targets-when-surplus-exists-wait-for-top-guys-if-affordable-don-t-leave-value-on-the-table
plan: 01
subsystem: draft-engine
tags: [typescript, vitest, auction-draft, budget-allocation, draft-board-engine]

# Dependency graph
requires:
  - phase: 63-mobile-draft-companion
    provides: draft-board-engine.ts with DraftBoardState interface

provides:
  - computeIdealRemainingSpend (exported function) in draft-board-engine.ts
  - isEligible at module scope (extracted from closure)
  - DraftBoardState.idealRemainingSpend field
  - DraftBoardState.surplusRatio field
  - DraftBoardState.surplusMultiplier field

affects:
  - phase 64-02 (will consume surplusMultiplier for bid-up logic)
  - computeDraftBoardState callers in content.tsx / popup

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Specificity-order position assignment: rarest positions (C, SS, 2B) claim best players before flex/UTIL"
    - "Set-based deduplication for multi-eligible players in greedy position fill"
    - "Surplus ratio clamping: max(0, ...) prevents negative surplus; min(0.5, ...) caps multiplier at 1.5x"

key-files:
  created:
    - packages/extension/lib/engine/__tests__/draft-board-engine.test.ts
  modified:
    - packages/extension/lib/engine/draft-board-engine.ts

key-decisions:
  - "surplusRatio is clamped to 0 when budget < idealRemainingSpend (no negative surplus)"
  - "surplusMultiplier capped at 1.5 via min(0.5, surplusRatio) to prevent runaway bid inflation"
  - "specificityOrder drives position claim priority — C/SS/2B before MI/CI/OF/SP/RP"
  - "isEligible extracted to module scope verbatim from computeDraftBoardState closure"

patterns-established:
  - "TDD RED→GREEN→REFACTOR: test commit before implementation commit"
  - "computeIdealRemainingSpend is pure (no side effects, exported for direct unit testing)"

requirements-completed: [BUDGET-IDEAL-SPEND, BUDGET-SURPLUS-RATIO]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 64 Plan 01: Dynamic Budget Allocation — Ideal Spend Summary

**computeIdealRemainingSpend + surplusRatio/surplusMultiplier fields added to DraftBoardState for position-aware budget tracking via specificity-ordered greedy fill**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-22T22:24:47Z
- **Completed:** 2026-03-22T22:27:27Z
- **Tasks:** 1 (TDD: RED + GREEN, no refactor needed)
- **Files modified:** 2

## Accomplishments
- Extracted `isEligible` from closure inside `computeDraftBoardState` to module scope
- Implemented and exported `computeIdealRemainingSpend`: sums best available FG$ at each unfilled position, using specificity order and Set-based deduplication
- Added three new `DraftBoardState` fields: `idealRemainingSpend`, `surplusRatio`, `surplusMultiplier`
- 11 TDD tests covering all 8 plan-specified scenarios pass

## Task Commits

TDD tasks have multiple commits (test → feat):

1. **RED phase** - `c2c277c` (test): failing tests for computeIdealRemainingSpend + DraftBoardState surplus fields
2. **GREEN phase** - `9eda4f7` (feat): implementation — isEligible extracted, computeIdealRemainingSpend, surplus fields wired

## Files Created/Modified
- `/packages/extension/lib/engine/__tests__/draft-board-engine.test.ts` — 11 tests across 8 scenarios for ideal spend and surplus calculation
- `/packages/extension/lib/engine/draft-board-engine.ts` — isEligible to module scope, computeIdealRemainingSpend exported, DraftBoardState interface + return extended

## Decisions Made
- surplusRatio clamped to 0 when budget < idealRemainingSpend (no negative surplus concept)
- surplusMultiplier capped at 1.5 (min(0.5, ratio) + 1) to avoid runaway bid inflation
- Specificity order drives which positions claim multi-eligible players: C, SS, 2B, 1B, 3B, MI, CI, OF, SP, RP

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - 22 pre-existing `strategy-caps.test.ts` failures exist in the repo and are unrelated to this plan's changes.

## Next Phase Readiness
- `surplusMultiplier` is available on every `DraftBoardState` return — plan 64-02 can consume it directly to bid up on board targets when surplus exists
- No blockers

---
*Phase: 64-dynamic-budget-allocation*
*Completed: 2026-03-22*

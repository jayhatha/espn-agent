---
phase: 62-priority-scored-auction-engine
plan: "01"
subsystem: testing
tags: [typescript, vitest, tdd, auction-engine, bid-optimizer, priority-scoring, ev-model]

# Dependency graph
requires:
  - phase: 61-dynamic-sgp-recalculation
    provides: dynamic SGP vectors, pool player types, engine architecture
  - phase: 60-sp-logic-audit
    provides: strategy-caps, draft-constants, tier cap patterns
provides:
  - EV-based priority scoring pure functions (computePriorityScore, computeEVMaxBid, tagPlayer, getCategoryWeight)
  - CategoryState interface (scarcity weights, pace ratios, surplus pool, cliff players, category directions)
  - PriorityScoreResult interface (priorityScore, evBuffer, categoryBonus, playerTags, maxBid)
  - 56 passing TDD tests covering all formula branches
affects: [62-02, 62-03, bid-optimizer-worker, compute-draft-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - EV = FG_Dollars - ESPN_ASV; missing ASV treated as EV=0 (fairly priced)
    - category_weight uses MAX across contributing stats (not sum)
    - scarcity_weight and team_need_weight both clamped to [1.0, 2.0]
    - hard cap is FG$ x 1.25 on RAW dollars, not inflated dollars
    - endgame dampening: 0.7x multiplier on evBuffer and categoryBonus when budget <= $20

key-files:
  created:
    - packages/extension/lib/engine/priority-scorer.ts
    - packages/extension/lib/engine/__tests__/priority-scorer.test.ts
  modified:
    - packages/extension/lib/engine/types.ts

key-decisions:
  - "priority_score = max(0, EV) x category_weight x scarcity_weight x team_need_weight; negative EV floors at 0"
  - "EV = FG$ - ESPN_ASV; when ASV undefined/null, EV = 0 (not NaN, treat as fairly priced)"
  - "max bid = inflated FG$ + evBuffer + categoryBonus, hard capped at FG$ x 1.25 (raw FG$, not inflated)"
  - "endgame dampening applies 0.7x to evBuffer and categoryBonus when budget <= $20"
  - "is_SP_anchor requires all three: K/IP > median AND ERA < median AND WHIP < median"
  - "computePriorityScore returns unconstrained maxBid; caller uses computeEVMaxBid with inflation/budget"

patterns-established:
  - "EV-scoring pattern: pure function, no side effects, CategoryState passed as argument"
  - "Tag classification: isPitcher gate separates hitter tags from pitcher tags cleanly"
  - "Weight clamping pattern: Math.max(min, Math.min(max, rawValue)) inline"

requirements-completed: [EV-SCORE, MAX-BID, TAGS]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 62 Plan 01: EV-Based Priority Scorer — Core Formula + Max Bid Summary

**Pure-function priority scoring engine with EV = FG$ - ESPN_ASV, category weights (SB=1.5 through HR=1.0), scarcity/team-need clamping, player tagging, and hard cap at FG$×1.25**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T23:00:34Z
- **Completed:** 2026-03-20T23:05:30Z
- **Tasks:** 2 (TDD: 1 RED + 1 GREEN)
- **Files modified:** 3

## Accomplishments
- Created `priority-scorer.ts` with four exported pure functions: `getCategoryWeight`, `computePriorityScore`, `computeEVMaxBid`, `tagPlayer`
- Added `CategoryState` and `PriorityScoreResult` interfaces to `types.ts`
- All 56 TDD tests pass covering EV formula, weight clamping, endgame dampening, hard cap, and all 5 player tag types
- Linter-added `forceAcquisitionCategories` field to `CategoryState` — updated test fixture to match

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for priority-scorer.ts** - `4cc63a1` (test)
2. **Task 2: Implement priority-scorer.ts and add types to types.ts** - `6077697` (feat)

_Note: TDD tasks committed separately (RED then GREEN)_

## Files Created/Modified
- `packages/extension/lib/engine/priority-scorer.ts` - EV-based priority scoring pure functions
- `packages/extension/lib/engine/__tests__/priority-scorer.test.ts` - 56 TDD tests
- `packages/extension/lib/engine/types.ts` - Added CategoryState and PriorityScoreResult interfaces

## Decisions Made
- Used `max(0, EV)` in priority formula so negative EV players get score=0 (not penalized below zero)
- `computePriorityScore` returns unconstrained maxBid (inflation=1.0, budget=Infinity) — caller supplies real inflation/budget to `computeEVMaxBid` directly for final bid
- `getCategoryWeight` exported (not internal) so tests can verify weights directly
- `forceAcquisitionCategories` added to `CategoryState` by linter — kept as-is since it's a valid extension for phase 62 feature completeness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added forceAcquisitionCategories to makeCategoryState test fixture**
- **Found during:** Task 2 (TypeScript compile check after implementation)
- **Issue:** Linter added `forceAcquisitionCategories: string[]` as a required field to `CategoryState` interface during write; test fixture was missing it causing TS2322 error
- **Fix:** Added `forceAcquisitionCategories: []` to `makeCategoryState()` default object
- **Files modified:** `packages/extension/lib/engine/__tests__/priority-scorer.test.ts`
- **Verification:** All 56 tests pass, no TS errors in new files
- **Committed in:** `6077697` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type conformance bug in test fixture)
**Impact on plan:** Trivial fix, no scope change.

## Issues Encountered
- pnpm --filter didn't match package (name is `@espn-agent/extension` not `@espn-fantasy/extension`). Used `cd packages/extension && npx vitest run` directly.

## Next Phase Readiness
- `priority-scorer.ts` ready for integration into `bid-optimizer-worker.ts` (plan 62-02)
- `CategoryState` interface is the wiring contract between `computeDraftEngine` and the bid worker
- All pure functions fully tested; integration will require passing real `CategoryState` from engine

---
*Phase: 62-priority-scored-auction-engine*
*Completed: 2026-03-20*

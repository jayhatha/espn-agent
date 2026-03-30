---
phase: 79-sophisticated-projection-model
plan: "01"
subsystem: backend
tags: [projection, staleness, slot-eligibility, fangraphs, ingest, vitest, typescript]

# Dependency graph
requires: []
provides:
  - "packages/backend/src/projection/types.ts - AllocationInput, AllocationResult, SlotAssignment, RosterGap, RosteredPlayer interfaces"
  - "packages/backend/src/projection/staleness.ts - computeProrateFactor, prorateComponents functions"
  - "packages/backend/src/projection/slot-eligibility.ts - canFillSlot standalone function extracted from TradeRecommendationAgent"
  - "FanGraphs CSV ingest now stores G, PA (batters) and G, GS (pitchers) in stat_components_json"
affects:
  - "79-02 (allocation model)"
  - "79-03 (standings projection integration)"
  - "79-04 (api exposure)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "projection/ subdirectory under backend/src for allocation model utilities"
    - "TDD red-green pattern for pure utility functions"
    - "computeProrateFactor uses remainingFromToday/remainingFromAsOf fraction with edge-case clamping"

key-files:
  created:
    - packages/backend/src/projection/types.ts
    - packages/backend/src/projection/staleness.ts
    - packages/backend/src/projection/slot-eligibility.ts
    - packages/backend/src/projection/__tests__/staleness.test.ts
    - packages/backend/src/projection/__tests__/slot-eligibility.test.ts
    - packages/backend/vitest.config.ts
  modified:
    - packages/backend/src/agents/projections-ingest.ts

key-decisions:
  - "canFillSlot extracted as standalone export — no longer trapped in TradeRecommendationAgent private method; reusable in allocation pipeline"
  - "OF slot rule added: OF position matches OF, LF, CF, RF slots (was missing from TradeRecommendationAgent original)"
  - "vitest.config.ts added to worktree backend package — test infrastructure was missing in worktree"
  - "G/PA/GS use parseFloat(row.X) || 0 — handles absent CSV columns gracefully (undefined parses to NaN, || 0 defaults)"

patterns-established:
  - "projection/ module: pure utility files with no DB dependencies, importable by any agent"
  - "staleness prorating: factor = clamp(remainingFromToday / remainingFromAsOf, 0, 1); handles same-day, past-end, and future-asOf edge cases"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03]

# Metrics
duration: 4min
completed: "2026-03-30"
---

# Phase 79 Plan 01: Sophisticated Projection Model Foundation Summary

**Projection types module, staleness prorating, slot eligibility extraction, and FanGraphs ingest enhanced with G/PA/GS playing-time columns**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-30T17:51:57Z
- **Completed:** 2026-03-30T17:55:26Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- Created `packages/backend/src/projection/` module with 3 utility files and 2 test files (23 tests, all passing)
- Extracted `canFillSlot` from `TradeRecommendationAgent` as a standalone reusable export with added OF slot rule
- `computeProrateFactor` implements staleness prorating: scales FanGraphs RoS projections by remaining season fraction
- FanGraphs CSV ingest now captures playing-time fields (G, PA for batters; G, GS for pitchers) needed by the allocation model

## Task Commits

Each task was committed atomically:

1. **Task 1: Create projection types, staleness module, and slot eligibility extraction with tests** - `78150ef` (feat)
2. **Task 2: Add G, PA, GS parsing to ProjectionsIngestAgent** - `602d80d` (feat)

**Plan metadata:** (docs commit below)

_Note: Task 1 used TDD — wrote failing tests first, then source files to make them pass._

## Files Created/Modified

- `packages/backend/src/projection/types.ts` - AllocationInput, AllocationResult, SlotAssignment, RosterGap, RosteredPlayer interfaces
- `packages/backend/src/projection/staleness.ts` - computeProrateFactor and prorateComponents functions
- `packages/backend/src/projection/slot-eligibility.ts` - canFillSlot standalone function (extracted + OF rule added)
- `packages/backend/src/projection/__tests__/staleness.test.ts` - 7 staleness test cases
- `packages/backend/src/projection/__tests__/slot-eligibility.test.ts` - 16 slot eligibility test cases
- `packages/backend/vitest.config.ts` - Test infrastructure (was missing in worktree)
- `packages/backend/src/agents/projections-ingest.ts` - Added G/PA (batters) and G/GS (pitchers) fields

## Decisions Made

- `canFillSlot` extracted as standalone — enables reuse in the allocation pipeline without importing the entire TradeRecommendationAgent
- OF slot rule was missing from the original private method in TradeRecommendationAgent; added to the standalone version per the research doc
- `vitest.config.ts` was missing from the worktree (existed only in main repo); added as a blocking deviation fix (Rule 3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest.config.ts to worktree backend package**
- **Found during:** Task 1 (running RED tests)
- **Issue:** No vitest.config.ts existed in the worktree's backend package; vitest failed to start
- **Fix:** Created vitest.config.ts matching main repo pattern (`defineConfig({ test: { globals: true } })`)
- **Files modified:** packages/backend/vitest.config.ts
- **Verification:** Tests ran successfully after adding config
- **Committed in:** 78150ef (Task 1 commit)

**2. [Rule 3 - Blocking] Ran pnpm install in worktree to install dependencies**
- **Found during:** Task 1 (first test run attempt)
- **Issue:** No node_modules in worktree, vitest binary not found
- **Fix:** Ran `pnpm install --frozen-lockfile` in worktree root
- **Files modified:** node_modules (not committed — gitignored)
- **Verification:** vitest binary available at packages/backend/node_modules/.bin/vitest
- **Committed in:** N/A (node_modules not tracked)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking issues in worktree setup)
**Impact on plan:** Both fixes were necessary for test infrastructure. No scope creep.

## Issues Encountered

- Worktree was freshly created with no node_modules or vitest config — standard worktree setup overhead resolved in ~10 seconds with pnpm install

## Known Stubs

None — all functionality is implemented and tested.

## Next Phase Readiness

- `packages/backend/src/projection/` module is the foundation for plans 79-02 through 79-04
- All 5 required interfaces exported from types.ts
- `computeProrateFactor` and `canFillSlot` are production-ready utilities
- FanGraphs ingest now stores G, PA, GS — allocation model can read playing time from stat_components_json

---
*Phase: 79-sophisticated-projection-model*
*Completed: 2026-03-30*

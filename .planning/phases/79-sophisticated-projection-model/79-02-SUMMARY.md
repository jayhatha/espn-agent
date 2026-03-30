---
phase: 79-sophisticated-projection-model
plan: "02"
subsystem: backend
tags: [projection, hitter-allocation, pitcher-scaling, gs-cap, greedy-algorithm, tdd, vitest, typescript]

# Dependency graph
requires:
  - "79-01 (projection types, slot-eligibility, staleness, vitest infrastructure)"
provides:
  - "packages/backend/src/projection/hitter-allocation.ts - allocateLineup, scorePlayer functions"
  - "packages/backend/src/projection/pitcher-scaling.ts - applyGsCap, scaleComponents functions"
affects:
  - "79-03 (standings projection integration — consumes allocateLineup and applyGsCap)"
  - "79-04 (api exposure)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Greedy slot assignment: SPECIFIC → FLEX → OVERFLOW tier ordering for most-constrained-first allocation"
    - "GS cap enforcement: scale factor = gsRemaining / totalProjectedGS, applied to all SP counting components"
    - "Bench/IL players bypass greedy assignment — immediately slotted with weight=0.0"
    - "estimateGS fallback: IP/6 when IP > 80 (SP threshold), 0 for relievers"

key-files:
  created:
    - packages/backend/src/projection/hitter-allocation.ts
    - packages/backend/src/projection/pitcher-scaling.ts
    - packages/backend/src/projection/__tests__/hitter-allocation.test.ts
    - packages/backend/src/projection/__tests__/pitcher-scaling.test.ts
  modified: []

key-decisions:
  - "Bench/IL players are separated immediately before greedy assignment loop — they never compete with active players for starting slots"
  - "scorePlayer uses HR+RBI+R+SB for hitters (no AB weighting) — simpler and avoids division by zero"
  - "isPitcherOnly checks IP>0 AND AB=0 — two-way players (Ohtani-type) have both, so they can fill hitter slots"
  - "Pitcher-only players excluded from hitter slots via positions check (all positions are SP/RP) — belt-and-suspenders with isPitcherOnly"
  - "applyGsCap receives only SP projections — caller (plan 79-03) is responsible for filtering SPs from RPs; RP isolation is architectural not in this module"
  - "GS fallback threshold: IP > 80 for SP, IP <= 80 treated as reliever (projectedGS=0)"

patterns-established:
  - "allocateLineup: pure function, no DB dependencies, takes players + rosterSlots, returns SlotAssignment[]"
  - "applyGsCap: pure function, takes gsUsed + gsCap + SPProjection[], returns scaledProjections + scaleFactor"

requirements-completed: [PROJ-04, PROJ-05, PROJ-06]

# Metrics
duration: 7min
completed: "2026-03-30"
---

# Phase 79 Plan 02: Hitter Allocation and Pitcher Scaling Summary

**Greedy hitter lineup allocation and GS cap-aware SP scaling — two pure utility modules with 27 test cases**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-30T17:56:39Z
- **Completed:** 2026-03-30T18:03:04Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments

- Created `packages/backend/src/projection/hitter-allocation.ts` with `allocateLineup` (greedy slot assignment) and `scorePlayer` (player priority scoring)
- Created `packages/backend/src/projection/pitcher-scaling.ts` with `applyGsCap` (GS cap enforcement) and `scaleComponents` (proportional scaling)
- 4 test files in `projection/__tests__/` — 50 total tests all passing
- TDD approach: wrote failing tests first for both tasks, then implemented to green

## Task Commits

Each task committed atomically:

1. **Task 1: Hitter lineup allocation** - `550a4b2` (feat) — allocateLineup + scorePlayer + 14 tests
2. **Task 2: GS cap pitcher scaling** - `5a5e290` (feat) — applyGsCap + scaleComponents + 13 tests

## Files Created

- `packages/backend/src/projection/hitter-allocation.ts` — exports `allocateLineup`, `scorePlayer`
- `packages/backend/src/projection/pitcher-scaling.ts` — exports `applyGsCap`, `scaleComponents`
- `packages/backend/src/projection/__tests__/hitter-allocation.test.ts` — 14 test cases
- `packages/backend/src/projection/__tests__/pitcher-scaling.test.ts` — 13 test cases

## Decisions Made

- Bench/IL players are separated before the greedy loop — they never compete with active players for starting slots; immediately assigned with weight=0.0
- `isPitcherOnly` checks IP>0 AND AB=0 so Ohtani-type two-way players can fill hitter slots
- `applyGsCap` only receives SP projections — architectural boundary: caller (plan 79-03) filters SPs from RPs
- GS fallback: IP/6 when IP > 80 (SP-level workload), 0 otherwise (reliever)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Merged worktree-agent-a442016f into current worktree before starting**
- **Found during:** Pre-execution setup
- **Issue:** This worktree was created before phase 79-01 ran; the `projection/` directory did not exist in the worktree
- **Fix:** `git merge worktree-agent-a442016f --no-edit --no-verify` — fast-forward merge brought in 79-01 files
- **Files modified:** projection/types.ts, projection/slot-eligibility.ts, projection/staleness.ts, and test files
- **Verification:** `ls packages/backend/src/projection/` confirmed all 79-01 artifacts present

**2. [Rule 3 - Blocking] Copied shared/dist from main repo to worktree**
- **Found during:** Pre-execution setup
- **Issue:** shared/dist was not built in the worktree (build fails due to kysely not in shared devDeps); tests that import from shared/dist would fail
- **Fix:** `rsync -av` from main repo's packages/shared/dist to worktree's packages/shared/dist
- **Files modified:** packages/shared/dist/ (not committed — gitignored build artifacts)
- **Verification:** node -e import test confirmed shared exports are accessible

**3. [Rule 3 - Blocking] pnpm install in worktree (pre-execution)**
- **Found during:** Pre-execution setup
- **Issue:** No node_modules in worktree; vitest binary not found
- **Fix:** `pnpm install --frozen-lockfile`
- **Files modified:** node_modules (not committed)

---

**Total deviations:** 3 auto-fixed (all Rule 3 blocking issues in worktree setup — same class as plan 79-01)
**Impact on plan:** All fixes were worktree infrastructure — no scope change to plan itself.

## Known Stubs

None — all functionality is implemented and tested.

## Next Phase Readiness

- `allocateLineup` is ready for use in plan 79-03 standings projection integration
- `applyGsCap` is ready for GS cap enforcement in plan 79-03
- Full projection module now has 50 tests across 4 files — all passing
- Plan 79-03 will wire these functions into `StandingsProjectionAgent`

---
*Phase: 79-sophisticated-projection-model*
*Completed: 2026-03-30*

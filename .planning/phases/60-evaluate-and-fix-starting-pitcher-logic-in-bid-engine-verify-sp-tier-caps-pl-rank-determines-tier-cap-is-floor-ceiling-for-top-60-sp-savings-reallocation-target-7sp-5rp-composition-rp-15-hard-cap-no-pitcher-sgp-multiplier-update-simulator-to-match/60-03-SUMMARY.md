---
phase: 60-sp-logic
plan: 03
subsystem: testing
tags: [bid-engine, sp-tier-caps, endgame, strategy-caps, vitest]

# Dependency graph
requires:
  - phase: 60-sp-logic
    provides: SP tier cap logic and ranked SP floor/ceiling enforcement (60-01, 60-02)
provides:
  - Endgame dampening guard that re-enforces ranked SP tier floor in strategy-caps.ts
  - Tests proving endgame cannot reduce ranked SP below tier floor
  - Phase-60 requirement IDs (SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT) in REQUIREMENTS.md
affects: [60-sp-logic, future-sp-audits, strategy-caps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-enforce tier floor after endgame dampening: apply floor guard after ×0.7 block, before inflation adjustment"
    - "Exception guard pattern: skip floor re-enforcement when spCount >= 7 (full roster cap takes precedence)"

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/strategy-caps.ts
    - packages/extension/lib/engine/__tests__/bid-ceiling.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Endgame re-enforce guard skips when spCount >= 7 — full-roster $3 cap takes precedence over tier floor"
  - "Re-enforce placed after endgame block but before inflation adjustment — preserves ordering invariant"

patterns-established:
  - "Tier floor re-enforcement pattern: after any dampening block that could violate a committed spend target, add a Math.max guard using the same tier-cap function"

requirements-completed: [SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 60 Plan 03: SP Logic Gap Closure Summary

**Endgame dampening guard added to strategy-caps.ts: ranked SP tier floor (e.g. $12 for PL#25) is now preserved after ×0.7 reduction, with two tests proving correctness and all 6 phase-60 requirement IDs registered in REQUIREMENTS.md**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T19:16:11Z
- **Completed:** 2026-03-19T19:18:06Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Fixed endgame dampening violation: a PL#25 SP (tier floor $12) in endgame mode now stays at $12 instead of being reduced to ceil(12×0.7)=$9
- Added two tests covering the endgame/tier-floor interaction: ranked SP floor preserved, filler SP (rank>60) still dampened without accidental floor
- Added all 6 phase-60 requirement IDs (SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT) to REQUIREMENTS.md with traceability table entries
- All 31 bid-ceiling tests pass (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix endgame dampening + tests + REQUIREMENTS.md** - `af5a9e7` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/extension/lib/engine/strategy-caps.ts` - Added re-enforce ranked SP tier floor guard after endgame block (spCount < 7 guard prevents conflict with full-roster $3 cap)
- `packages/extension/lib/engine/__tests__/bid-ceiling.test.ts` - Two new endgame tests: ranked SP floor held at $12, filler SP dampened without floor
- `.planning/REQUIREMENTS.md` - Phase 60 SP Logic Audit section + traceability table entries for all 6 requirement IDs

## Decisions Made

- Re-enforce guard skips when `spCount >= 7`: the full-roster $3 cap (set when spCount >= 7) takes precedence — these are overflow SPs with no committed tier spend
- Guard placed immediately after endgame block, before inflation adjustment — preserves pipeline ordering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing test "8. 7+ SPs" broke with naive re-enforce guard**
- **Found during:** Task 1 (running tests after first implementation)
- **Issue:** The re-enforce guard `if (isSP && rank <= 60)` also fired when `spCount >= 7`, overriding the $3 full-roster cap and returning $18 for a PL#5 with 7+ SPs
- **Fix:** Added `&& input.spCount < 7` condition so the full-roster cap path is not affected
- **Files modified:** packages/extension/lib/engine/strategy-caps.ts
- **Verification:** All 31 tests pass including existing test 8
- **Committed in:** af5a9e7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in initial guard implementation)
**Impact on plan:** Essential correctness fix — the guard needed a scope guard to not conflict with the 7+ SP overflow path.

## Issues Encountered

None beyond the auto-fixed test failure above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 60 gap closure complete: all three VERIFICATION.md gaps (endgame floor violation, phantom requirement IDs) are now resolved
- strategy-caps.ts endgame behavior is fully correct: ranked SPs keep tier floor, filler SPs and overflow SPs dampened normally
- All 6 phase-60 requirement IDs registered in REQUIREMENTS.md with complete traceability

---
*Phase: 60-sp-logic*
*Completed: 2026-03-19*

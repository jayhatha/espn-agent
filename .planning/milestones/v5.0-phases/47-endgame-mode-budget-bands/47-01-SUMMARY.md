---
phase: 47-endgame-mode-budget-bands
plan: 01
subsystem: extension
tags: [auction-draft, endgame, budget-bands, value-per-dollar, bid-strategy]

requires:
  - phase: 29-ideal-roster-optimizer
    provides: IdealRosterSignal with SGP values for value_per_dollar scoring
provides:
  - Endgame mode activation at budget <= $20 with value_per_dollar scoring
  - Hitter/pitcher budget allocation band tracking (185-205 / 55-70)
  - Endgame bid filtering preferring breakout hitters, cheap OF, K pitchers
affects: [auto-bid-controller, budget-curve, draft-engine]

tech-stack:
  added: []
  patterns: [endgame-mode-flag, value-per-dollar-scoring, budget-band-tracking]

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/budget-curve.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/auto-bid-controller.ts

key-decisions:
  - "Endgame threshold at $20 remaining budget (covers ~20 $1 fillers)"
  - "30% bid cap dampening in endgame mode to preserve remaining budget"
  - "value_per_dollar threshold of 0.3 for endgame player filtering"
  - "SGP < 1 as weak hitter cutoff in endgame mode"

patterns-established:
  - "Endgame mode flag on BudgetCurveSignal drives bid strategy changes"
  - "Budget band targets as static reference values (not dynamic constraints)"

requirements-completed: [END-01, END-02, END-03]

duration: 4min
completed: 2026-03-15
---

# Phase 47 Plan 01: Endgame Mode & Budget Bands Summary

**Endgame mode with value_per_dollar scoring at budget <= $20, plus hitter/pitcher budget allocation band tracking in BudgetCurveSignal**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T23:29:12Z
- **Completed:** 2026-03-15T23:33:01Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments
- BudgetCurveSignal extended with endgameMode flag, budget band targets, and hitter/pitcher spending tracking
- computeBudgetCurve returns endgameMode=true when remainingBudget <= 20, with static budget band targets
- Engine computes hitter/pitcher spending split from myRoster positions and passes to budget curve
- Auto-bid controller applies endgame logic: value_per_dollar filtering, weak hitter avoidance, 30% bid dampening

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend BudgetCurveSignal types** - `1948ed9` (feat)
2. **Task 2: Compute endgame and budget bands** - `25c3ee9` (feat)
3. **Task 3: Wire spending through engine** - `0ca4f1a` (feat)
4. **Task 4: Add endgame mode to auto-bid** - `030d673` (feat)
5. **Task 5: Build verification** - passed (no commit needed)

## Files Created/Modified
- `packages/extension/lib/engine/types.ts` - Added endgameMode, budget band targets, and spending fields to BudgetCurveSignal
- `packages/extension/lib/engine/budget-curve.ts` - Computes endgameMode flag and returns budget band data
- `packages/extension/lib/engine/index.ts` - Computes hitter/pitcher spending from roster positions
- `packages/extension/lib/auto-bid-controller.ts` - Endgame value_per_dollar filtering, weak hitter skip, 30% bid dampening

## Decisions Made
- Endgame threshold at $20: covers approximately 20 remaining $1 filler slots, appropriate for a 28-slot roster
- 30% endgame bid dampening applied on top of all other modifiers to preserve remaining budget
- value_per_dollar < 0.3 used as skip threshold -- filters out most low-value players while keeping high-efficiency picks
- Weak hitter defined as SGP < 1 -- avoids players who barely contribute to category totals
- Budget bands are static reference values (H: 185-205, P: 55-70, BN: 5) tracked for display, not enforced as hard constraints

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Endgame mode and budget bands are live in the extension
- Budget band data available in BudgetCurveSignal for UI display (e.g., budget allocation progress bars)
- hitterSpent/pitcherSpent can be used by future phases for budget pacing alerts

## Self-Check: PASSED

All 4 modified files exist. All 4 task commits verified.

---
*Phase: 47-endgame-mode-budget-bands*
*Completed: 2026-03-15*

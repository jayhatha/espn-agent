---
phase: 28-forward-looking-draft-simulation
plan: 01
subsystem: extension-engine
tags: [simulation, monte-carlo, draft-engine, typescript, softmax, roto-standings]

# Dependency graph
requires:
  - phase: 23-roster-optimization
    provides: PoolPlayer, SimDraftState patterns, Set<number> O(1) tracking
  - phase: 25-projected-standings
    provides: computeSimStandings roto points pattern, calculateFinalRate usage
  - phase: 26-per-position-target-engine
    provides: ShoppingListSignal in DraftEngineSignals

provides:
  - simulateFullDraft: round-robin softmax-weighted draft completion for all teams
  - softmaxSelect: temperature-scaled weighted random player selection with top-K filter
  - computeSimStandings: lightweight roto standings from componentTotals via calculateFinalRate
  - cloneSimState: independent deep copy of SimDraftState (Set<number> clone)
  - draftPlayerToTeam: in-place state mutation (budget, slots, totals)
  - compareDecisions: run N simulations per candidate action, return DecisionComparison
  - aggregateOutcomes: compute winProbability/expectedFinish/stdDev from sim results
  - ForwardSimulationSignal type + simulation field in DraftEngineSignals

affects:
  - phase-28-plan-02: will wire compareDecisions into computeDraftEngine output
  - phase-28-plan-03: nomination strategy UI will consume ForwardSimulationSignal

# Tech tracking
tech-stack:
  added: []
  patterns:
    - softmax-weighted selection with temperature control for draft simulation
    - top-K filter before softmax for O(n) simulation performance
    - per-simulation state cloning with Set<number> for O(1) player removal
    - component-based rate stat aggregation in SimTeamState.componentTotals
    - TDD: RED commit (failing tests) → GREEN commit (implementation) per task

key-files:
  created:
    - packages/extension/lib/engine/draft-simulator.ts
    - packages/extension/lib/engine/decision-comparison.ts
    - packages/extension/lib/__tests__/draft-simulator.test.ts
    - packages/extension/lib/__tests__/decision-comparison.test.ts
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "Top-K=15 filter before softmax provides speed without sacrificing selection quality at relevant candidates"
  - "Temperature=1.0 default produces realistic diversity; T=0.1 gives near-greedy selection for deterministic testing"
  - "componentTotals duplicates stats for rate stat calculation (ERA, WHIP, AVG) - categoryTotals used for counting"
  - "cloneSimState copies Set<number> with new Set() and spreads team states - O(n) clone is acceptable for 200 sims"
  - "compareDecisions uses modified player array for bid price override (not mutating original) for correctness"
  - "simulation: null placeholder in DraftEngineSignals return - Plan 02 wires the actual computation"
  - "Player pool size must exceed total roster slots (12 teams * 23 slots = 276) for full-fill test to pass"

patterns-established:
  - "SimTeamState tracks both categoryTotals (counting) and componentTotals (rate) for complete standings computation"
  - "Round-robin simulation loop breaks when zero picks in a full round (all teams full or pool empty)"
  - "aggregateOutcomes ranks by counting teams with strictly MORE roto pts (ties produce shared rank 1)"

requirements-completed: [SIM-01, SIM-02, SIM-03, SIM-04]

# Metrics
duration: 8min
completed: 2026-03-06
---

# Phase 28 Plan 01: Forward-Looking Draft Simulation Summary

**Softmax-weighted full-draft simulation engine with standings-based bid/pass comparison producing win probability distributions across 200+ simulations in under 1 second**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-06T15:27:57Z
- **Completed:** 2026-03-06T15:35:57Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `simulateFullDraft` completes entire remaining draft for all teams using softmax-weighted player selection with configurable temperature and top-K optimization for speed
- `compareDecisions` evaluates bid vs pass scenarios by running N independent simulations per action and returning win probability, expected finish rank, top-3/6 probabilities, and expected roto points
- `computeSimStandings` produces accurate roto standings from simulated rosters including LOWER_BETTER categories (ERA, WHIP) via `calculateFinalRate` with IP=0 guard
- All 25 tests pass; performance test confirms 300 full-draft simulations well under 1 second
- `ForwardSimulationSignal` type added to `DraftEngineSignals` (wired as null placeholder for Plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1 - RED (draft-simulator tests):** `4fe1cbc` (test)
2. **Task 1 - GREEN (draft-simulator.ts + types.ts):** `22b697b` (feat)
3. **Task 2 - RED (decision-comparison tests):** `cfd3748` (test)
4. **Task 2 - GREEN (decision-comparison.ts):** `2c3b939` (feat)

_Note: TDD tasks have multiple commits (test → feat) per TDD convention_

## Files Created/Modified

- `packages/extension/lib/engine/draft-simulator.ts` - simulateFullDraft, softmaxSelect, computeSimStandings, cloneSimState, draftPlayerToTeam
- `packages/extension/lib/engine/decision-comparison.ts` - compareDecisions, aggregateOutcomes
- `packages/extension/lib/engine/types.ts` - SimTeamState, SimDraftState, SimulationOutcome, CandidateAction, DecisionComparison, NominationRecommendation, ForwardSimulationSignal + simulation field in DraftEngineSignals
- `packages/extension/lib/engine/index.ts` - Added simulation: null to DraftEngineSignals return object
- `packages/extension/lib/__tests__/draft-simulator.test.ts` - 14 tests for simulateFullDraft, softmax, standings, clone, draftPlayerToTeam, performance
- `packages/extension/lib/__tests__/decision-comparison.test.ts` - 11 tests for compareDecisions and aggregateOutcomes

## Decisions Made

- Top-K=15 filter before softmax: keeps simulation fast without losing selection quality (top candidates dominate regardless)
- Temperature=1.0 default: produces realistic diversity across sims; tested T=0.1 for near-greedy selection in deterministic tests
- SimTeamState tracks both `categoryTotals` and `componentTotals`: counting stats read directly, rate stats computed via `calculateFinalRate` from components
- `cloneSimState` uses `new Set(state.availableIndices)` and spread operators — independent copies verified by mutation test
- `compareDecisions` bid action: creates modified player array with `bidPrice` override instead of mutating the original pool
- `simulation: null` in DraftEngineSignals return: placeholder prevents type error; Plan 02 wires actual computation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test pool size too small to fill all 276 roster slots**
- **Found during:** Task 1 (draft-simulator.ts implementation)
- **Issue:** Plan specified "12 teams, 23 roster slots each, 200 player pool" but 12*23=276 > 200, so not all slots could be filled
- **Fix:** Updated test fixture to use 400 players (300 would barely work but 400 provides margin for position-eligibility constraints)
- **Files modified:** packages/extension/lib/__tests__/draft-simulator.test.ts
- **Verification:** simulateFullDraft fills all roster slots when pool >= 276 players
- **Committed in:** 22b697b (Task 1 feat commit)

**2. [Rule 1 - Bug] Test used require() for aggregateOutcomes but module is ESM**
- **Found during:** Task 2 (decision-comparison.ts implementation)
- **Issue:** aggregateOutcomes tests used `require("../engine/decision-comparison")` but vitest runs in ESM mode, causing MODULE_NOT_FOUND at runtime
- **Fix:** Removed require() calls, using already-imported `aggregateOutcomes` from top-level ES import
- **Files modified:** packages/extension/lib/__tests__/decision-comparison.test.ts
- **Verification:** All 11 tests pass with direct ES import
- **Committed in:** 2c3b939 (Task 2 feat commit)

**3. [Rule 1 - Bug] DraftEngineSignals missing simulation field causing type error**
- **Found during:** Task 1 (types.ts modification - adding simulation to DraftEngineSignals)
- **Issue:** engine/index.ts returns DraftEngineSignals object without the new simulation field, causing TS2741
- **Fix:** Added `simulation: null` to the return object in index.ts
- **Files modified:** packages/extension/lib/engine/index.ts
- **Verification:** No type errors for new files; tsc confirms clean
- **Committed in:** 22b697b (Task 1 feat commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

- `draft-simulator.ts` and `decision-comparison.ts` are ready for Plan 02 to wire into `computeDraftEngine`
- `ForwardSimulationSignal` type is defined in `types.ts` and referenced in `DraftEngineSignals`
- `simulation: null` placeholder in engine/index.ts will be replaced by Plan 02 with actual `compareDecisions` call
- Performance budget confirmed: 300 simulations well under 1 second

---
*Phase: 28-forward-looking-draft-simulation*
*Completed: 2026-03-06*

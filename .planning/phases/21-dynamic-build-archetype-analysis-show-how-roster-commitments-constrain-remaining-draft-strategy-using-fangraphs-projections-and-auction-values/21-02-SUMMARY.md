---
phase: 21-dynamic-build-archetype-analysis
plan: 02
subsystem: extension
tags: [tdd, draft-engine, archetype, fangraphs, pure-function, greedy-fill, archetype-classification]

# Dependency graph
requires:
  - phase: 21-01
    provides: FanGraphs JSON assets, typed fangraphs-data.ts, BuildArchetypeSignal/CategoryCeiling/PivotPlayer types
  - phase: 20-deterministic-draft-engine
    provides: DraftEngineInput/DraftEngineSignals types and computeDraftEngine orchestrator
provides:
  - computeBuildArchetype pure function with position-aware greedy fill ceiling simulation
  - Archetype classification (Power Build, Speed Build, Pitching-First, Balanced, Stars-and-Scrubs, OBP/OPS Heavy)
  - Category ceiling computation with component-based rate stat math
  - Punt detection (ceiling < 70% of competitive target)
  - Pivot player identification (top 3 affordable players by ceiling lift)
  - archetype field wired into computeDraftEngine as step 6
  - 10 unit tests covering all behavior requirements
affects: [21-03-archetype-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD (RED → GREEN) with failing tests committed before implementation
    - Per-player z-score computation against full player pool (drafted + undrafted) for archetype classification
    - Position-aware greedy fill using separate hitter/pitcher auction pools with shared budget
    - Component-based rate stat math (sum AB/H across players, then H/AB — not average of rates)

key-files:
  created:
    - packages/extension/lib/engine/archetype.ts
    - packages/extension/lib/__tests__/archetype.test.ts
  modified:
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "Per-player z-score vs. full player pool (drafted + undrafted) for archetype classification — avoids stddev=0 when undrafted pool has uniform stats"
  - "computeBuildArchetype is purely parameter-driven (not importing FG data directly) — data flows in from computeDraftEngine which imports fangraphs-data.ts"
  - "archetype: null returned for < 3 picks (DraftEngineSignals type uses null for insufficient data)"
  - "Position-aware greedy fill: wantHitter logic uses proportional slot comparison (hitterSlotsRemaining >= pitcherSlotsRemaining) as tiebreaker"
  - "Competitive target = top slotsPerTeam*3 players' stat sum — represents top-3 team potential from full player pool"

patterns-established:
  - "Archetype z-score: per-player average from my roster vs. population mean/stddev from all available players"
  - "Greedy fill budget tracking: maxSpendNow = budgetLeft - (spotsLeft - 1) reserves $1 per remaining spot"
  - "Pivot player ceiling lift: for counting stats = player's stat value, for rate stats = rate improvement vs current ceiling"

requirements-completed: []

# Metrics
duration: 132min
completed: 2026-03-04
---

# Phase 21 Plan 02: computeBuildArchetype Engine Summary

**Position-aware greedy fill ceiling simulation + archetype classification implemented as a pure function using TDD, wired into the draft engine as step 6**

## Performance

- **Duration:** 132 min (includes TDD RED → GREEN cycle + 3 bug fixes)
- **Started:** 2026-03-04
- **Completed:** 2026-03-04
- **Tasks:** 1 (single TDD feature with RED and GREEN commits)
- **Files modified:** 3

## Accomplishments

- Created `archetype.ts` (905 lines) with `computeBuildArchetype` pure function containing 6 internal helpers: `normalizeName`, `buildFgPlayerPool`, `positionAwareGreedyFill`, `computeCompetitiveTarget`, `classifyArchetype`, `findPivotPlayers`
- Implemented position-aware greedy fill that splits remaining roster spots into hitting/pitching groups and fills each from its own auction value pool (hitters from fgAuctionHittersData, pitchers from fgAuctionPitchersData) sharing the overall budget
- Rate stat ceilings use component-based math (sum AB/H across all players, compute H/AB as rate — never average individual player rates)
- Archetype classification uses per-player z-scores comparing my roster's per-player average vs. full player pool (drafted + undrafted) mean/stddev — avoids stddev=0 edge case
- Competitive targets computed as top (slotsPerTeam * 3) players' stat sums — represents top-3 team potential
- Punt detection flags categories where ceiling < 70% of competitive target (or > 130% for LOWER_BETTER)
- Pivot player identification returns top 3 affordable undrafted players by ceiling lift in weakest categories
- Wired into `computeDraftEngine` as step 6, passing bundled FanGraphs data from `fangraphs-data.ts` imports
- 10 unit tests written in RED phase before implementation, all passing in GREEN phase

## Task Commits

TDD flow — two commits per the protocol:

1. **RED phase (failing tests)** - `a3863d2` — `test(21-02): add failing tests for computeBuildArchetype`
2. **GREEN phase (implementation)** - `05a27f5` — `feat(21-02): implement computeBuildArchetype pure function with position-aware greedy fill`

## Files Created/Modified

- `packages/extension/lib/engine/archetype.ts` — 905-line pure function with 6 internal helpers; computeBuildArchetype exported; no Zustand, no DOM, no side effects
- `packages/extension/lib/__tests__/archetype.test.ts` — 489 lines, 10 test cases covering all 9 behavior requirements from plan
- `packages/extension/lib/engine/index.ts` — added imports for computeBuildArchetype and fangraphs-data; wired as step 6 in computeDraftEngine; returns archetype field (null when < 3 picks)

## Decisions Made

- **Per-player z-score against full pool:** Archetype classification needs to compare my team's stats to a meaningful baseline. Using competitive target as baseline caused division-by-zero issues when the undrafted pool had uniform stat values. Solution: compute z-scores as (myPerPlayerAvg - poolMean) / poolStdDev using ALL players (drafted + undrafted) for the population. This ensures non-zero stddev in realistic and test scenarios.

- **computeBuildArchetype receives FG data as parameters:** The function is purely parameter-driven rather than importing `fangraphs-data.ts` directly inside archetype.ts. The data flows in from `computeDraftEngine` in index.ts which handles the static JSON imports. This keeps archetype.ts fully testable with mock data.

- **archetype null threshold = 3 picks:** `DraftEngineSignals.archetype` is typed as `BuildArchetypeSignal | null`. The return is null when `picksAnalyzed < 3` (not 5) to match the type comment "null when insufficient data (< 3 picks)". The archetype label itself is still null when `picksAnalyzed < 5` per the classification rules.

- **Greedy fill wantHitter logic:** When both hitter and pitcher slots remain, the hitter pool is preferred when hitterSlotsRemaining >= pitcherSlotsRemaining. This ensures proportional fill rather than all-hitters-first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Set.set() does not exist — should be Set.add()**
- **Found during:** GREEN phase (first test run)
- **Issue:** `pitcherAuctionNames.set(name)` called `.set()` instead of `.add()` on a Set. TypeScript Set uses `.add()` not `.set()` (Maps use `.set()`).
- **Fix:** Changed to `.add()`
- **Files modified:** `packages/extension/lib/engine/archetype.ts`
- **Commit:** `05a27f5` (fixed before commit)

**2. [Rule 1 - Bug] Archetype classification z-scores returned 0 when stddev=0**
- **Found during:** GREEN phase test for "Power Build" classification
- **Issue:** When the undrafted player pool has uniform stat values (e.g., all 30 speed hitters with identical HR=5), stddev = 0 and the code returned zScore = 0. This made my power hitters (HR=40) indistinguishable from the pool.
- **Fix 1:** Changed population to include ALL players (drafted + undrafted) so the mix of power hitters + speed hitters gives non-zero stddev.
- **Fix 2:** Added fallback for zero stddev using ratio-based z-score: `(myPerPlayer / poolMean - 1) * 2`
- **Files modified:** `packages/extension/lib/engine/archetype.ts` (classifyArchetype function)
- **Commit:** `05a27f5` (fixed before final commit)

**3. [Rule 2 - Missing] classifyArchetype signature missing draftedPlayers parameter**
- **Found during:** GREEN phase — needed draftedPlayers to compute per-player stats for z-score
- **Issue:** Original classifyArchetype only received categoryCeilings and allUndrafted. The z-score computation needed draftedPlayers to build the full player pool.
- **Fix:** Added `draftedPlayers: PoolPlayer[]` parameter and combined `[...draftedPlayers, ...allPlayersForZScore]` for population statistics.
- **Files modified:** `packages/extension/lib/engine/archetype.ts`
- **Commit:** `05a27f5`

**Total deviations:** 3 auto-fixed (Rules 1 and 2)

## Issues Encountered

None beyond the 3 auto-fixed issues above.

## User Setup Required

None — all FanGraphs data is bundled as static JSON assets from Plan 01.

## Next Phase Readiness

- `archetype` field populated in `DraftEngineSignals` for all drafts with 3+ picks
- `BuildArchetypeSignal` contains `ceilings`, `archetypeLabel`, `archetypeConfidence`, `pivotPlayers`, `spendingSplit`
- Plan 03 can consume `signals.archetype` to render the archetype UI section in the extension sidebar

---
*Phase: 21-dynamic-build-archetype-analysis*
*Completed: 2026-03-04*

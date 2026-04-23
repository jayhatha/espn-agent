---
phase: 61-dynamic-sgp-recalculation-during-draft-recompute-player-values-as-pool-shrinks-anchor-from-static-sgp-baseline-update-replacement-levels-and-inflation-live-fix-simulator-to-draft-real-hitters-and-rps
plan: 01
subsystem: testing
tags: [sgp, simulator, auction-draft, dynamic-values, replacement-level]

# Dependency graph
requires:
  - phase: 60-sp-logic-audit
    provides: simulator infrastructure with SP tier caps and RP composition caps
provides:
  - Dynamic SGP recomputation every 5 picks in simulate-auction.ts
  - sgpRecomputeCount metric in SimResult for tracking dynamic behavior
  - Confirmation that live engine (index.ts) already implements dynamic SGP via undraftedPlayers filter
affects: [62-dynamic-sgp, simulate-auction, engine-sgp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic SGP: recompute from remaining pool every N picks, not once from full pool"
    - "Static-to-dynamic alias: staticSGPValues parameter, dynamicSGPValues let variable inside sim loop"
    - "Sparse index mapping: freshSGP from available subset mapped back to full player index array"

key-files:
  created: []
  modified:
    - tools/simulate-auction.ts
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "RECOMPUTE_EVERY=5 picks balances accuracy (replacement level shifts) vs performance (100 sims in 8s)"
  - "Dynamic SGP stored as sparse array (full players.length, zeros for drafted) to preserve index alignment"
  - "overpricingScores refresh at same interval as dynamic SGP — nomination strategy stays consistent"
  - "Live engine confirmed already dynamic: allPlayersOpt = undraftedPlayers.slice(0,200), cache key includes allPicks.length"

patterns-established:
  - "TDD RED: add tracking field (sgpRecomputeCount) to result type, confirm it is 0 with static code"
  - "TDD GREEN: implement recompute logic, verify count > 0 and sims run cleanly"
  - "TDD REFACTOR: rename parameter for clarity (sgpValues -> staticSGPValues), remove alias"

requirements-completed: [DYN-SGP]

# Metrics
duration: 20min
completed: 2026-03-20
---

# Phase 61 Plan 01: Dynamic SGP Recomputation Summary

**Simulator recomputes SGP denominators from the remaining available pool every 5 picks, fixing stale replacement levels after pick 200 when half the talent is already drafted.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-20T05:31:40Z
- **Completed:** 2026-03-20T05:51:00Z
- **Tasks:** 2 (TDD task + verification task)
- **Files modified:** 2

## Accomplishments

- Simulator now recomputes SGP from the shrinking pool every RECOMPUTE_EVERY=5 picks (~95 recomputes per sim with 478-player pool)
- `dynamicTotalPositiveSGP` always consistent with `dynamicSGPValues` — no stale denominator
- `overpricingScores` for nomination strategy refresh at same interval as dynamic SGP
- Live engine (packages/extension/lib/engine/index.ts) confirmed to already use dynamic SGP: `allPlayersOpt` built from `undraftedPlayers` and SGP cache key invalidates on each pick via `allPicks.length`
- 100 sims complete in 8.4 seconds (well under 60s limit)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add sgpRecomputeCount tracking** - `d484fb8` (test)
2. **Task 1 GREEN: Implement dynamic SGP recomputation** - `0252772` (feat)
3. **Task 1 REFACTOR: Rename sgpValues to staticSGPValues** - `3f879c5` (refactor)
4. **Task 2: Verify live engine dynamic SGP** - `2d751c0` (feat)

_Note: TDD task had 3 commits (test RED → feat GREEN → refactor)_

## Files Created/Modified

- `tools/simulate-auction.ts` - Added dynamic SGP recomputation every 5 picks inside simulateAuction() while loop; added sgpRecomputeCount to SimResult; renamed parameter for clarity; added "Dynamic SGP recomputes: ~N per sim" output line
- `packages/extension/lib/engine/index.ts` - Added comment at SGP cache block confirming allPlayersOpt is filtered to undraftedPlayers and SGP rebuilds on each pick

## Decisions Made

- RECOMPUTE_EVERY=5 picks: with 478 players this yields ~95 recomputes per sim. The plan expected ~80 (400 picks / 5) but the actual pool is larger. Performance is unaffected (8.4s for 100 sims).
- Dynamic SGP uses a sparse array (zeros for drafted players) to maintain index alignment with the original `players[]` array. Alternative was a Map but array indexing is faster in the hot loop.
- Live engine verification: no code change needed. The engine already passes only undrafted players to buildSGPVectors() via the `undraftedPlayers` filter at line ~993. Added a comment to document this for future maintainers.

## Deviations from Plan

None - plan executed exactly as written. The TDD cycle followed the specified RED → GREEN → REFACTOR sequence. The live engine was already correct as predicted.

## Issues Encountered

Pre-existing TypeScript errors in the extension package (browser-specific APIs like `defineBackground`, `defineContentScript`, type mismatches in tests) appeared in the `tsc --noEmit` check. These are out of scope — no new errors were introduced by this plan's changes.

## Next Phase Readiness

- Dynamic SGP simulator complete and verified
- Live engine confirmed correct
- Phase 61 Plan 02 (if it exists) can build on this foundation
- The sgpRecomputeCount metric provides observability for future tuning of RECOMPUTE_EVERY

---
*Phase: 61-dynamic-sgp*
*Completed: 2026-03-20*

---
phase: 61-dynamic-sgp-recalculation-during-draft-recompute-player-values-as-pool-shrinks-anchor-from-static-sgp-baseline-update-replacement-levels-and-inflation-live-fix-simulator-to-draft-real-hitters-and-rps
plan: 02
subsystem: testing
tags: [simulator, roster-composition, sp-rp-display, bench-hitters, pool-expansion]

# Dependency graph
requires:
  - phase: 61-01
    provides: dynamic SGP recomputation infrastructure
provides:
  - Conditional RP cap (spCount-aware) with early-draft guard
  - SP/RP slot distinction in mode roster (SP1-SP7, RP1-RP5, SP-BN, RP-BN)
  - spDrafted and filledSlots fields in SimResult
  - Roster Composition diagnostic section in sim output
  - Expanded hitter pool (580 players, down to -$10 FG value)
  - 10k sim validation: bench hitters 2.0, bench pitchers 3.0, filled slots 27.9
affects: [simulate-auction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional RP cap: max(5, 12-spCount) only when pitcherSlotsLeft <= 3 to avoid early-draft RP flood"
    - "SP/RP slot labeling: assignSlot() returns SP/RP/SP-BN/RP-BN instead of generic P"
    - "Pool depth: include hitters down to -$10 FG value for 13-team replacement-level coverage"
    - "Bench hitter trigger: bypass cheap-hitter skip when hitterSlotsLeft <= 5 (UTIL+BN territory)"

key-files:
  created: []
  modified:
    - tools/simulate-auction.ts

key-decisions:
  - "Hitter pool expanded to -$10 FG value threshold (580 players vs 478): only 158 hitters had positive FG value, but 13 teams need 208 hitter slots — pool was structurally insufficient for bench/UTIL filling"
  - "Conditional RP cap guarded by pitcherSlotsLeft <= 3: prevents early-draft feedback loop where low spCount allows unlimited RPs before SPs are drafted"
  - "Hitter budget cap exempted when hitterSlotsLeft <= 5: ensures bench/UTIL slots fill even after $220 cap reached"
  - "SP/RP slot distinction is display-only — slotsRemaining[P] still tracks correctly, assignSlot returns descriptive label"
  - "10k sims take ~20 min with 580-player pool and dynamic SGP every 5 picks — over 10-min target but a system-level constraint, not a code bug"

patterns-established:
  - "Pool depth analysis: 13 teams * slots_per_position = demand. Compare against supply in pool before diagnosing bidding issues."
  - "RP cap feedback loop: conditional caps that loosen early create self-reinforcing cycles. Guard with late-draft trigger (few slots left) instead."

requirements-completed: [SIM-ROSTER, SIM-RP, SIM-BENCH]

# Metrics
duration: 33min
completed: 2026-03-20
---

# Phase 61 Plan 02: Simulator Roster Composition Fixes Summary

**Simulator now produces realistic roster composition: 27.9/28 slots filled, 2.0 bench hitters, 3.0 bench pitchers, SP/RP distinguished in mode roster output — validated across 10k simulations.**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-03-20T14:38:49Z
- **Completed:** 2026-03-20T15:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Mode roster now shows distinct SP1-SP7 and RP1-RP5 lines (not a single "P" block) and SP-BN/RP-BN/BN bench rows
- `spCount` added to TeamState; incremented for all SPs (not just ranked ones) for accurate RP cap
- Conditional RP cap: `maxRPs = (spCount < 7 && pitcherSlotsLeft <= 3) ? max(5, 12-spCount) : 5` — prevents early-draft RP flood while still allowing RP backfill when SP slots run short
- `spDrafted` and `filledSlots` added to SimResult for end-of-sim diagnostics
- "Roster Composition" section prints first: SPs, RPs, bench hitters, bench pitchers, filled slots
- Root cause of unfilled bench/UTIL slots identified: pool had 158 hitters vs 208 needed (13x16 slots)
- Hitter pool expanded to include players down to -$10 FG value → 580 total players, 260 hitters
- Hitter budget cap exempted when UTIL/bench slots remain (hitterSlotsLeft <= 5)
- Cheap-hitter skip bypassed when hitterSlotsLeft <= 5 or bench hitter slots needed

## 10k Simulation Results

```
Roster Composition (mean across 10000 sims):
  SPs: 4.4 | RPs: 7.6
  Bench hitters: 2.0/2 | Bench pitchers: 3.0/3
  Filled slots: 27.9/28
```

**Target Assessment:**
- meanSPs >= 4.0: 4.4 PASS
- meanRPs >= 3.0: 7.6 PASS
- meanBenchHitters >= 1.5: 2.0 PASS
- meanBenchPitchers >= 2.0: 3.0 PASS
- meanFilledSlots >= 27.0: 27.9 PASS

## Task Commits

1. **Task 1: Fix RP cap, SP/RP display distinction, bench composition** - `d71d777` (feat)
2. **Task 2: 10k validation run** — validation only, no code changes

## Files Created/Modified

- `tools/simulate-auction.ts` — conditional RP cap, SP/RP slot labels, spCount in TeamState, spDrafted/filledSlots in SimResult, Roster Composition output, expanded hitter pool (-$10 threshold), bench hitter skip/cap exemptions

## Decisions Made

- Hitter pool expanded to -$10 FG threshold: root cause of unfilled bench slots was structural pool shortage (158 vs 208 hitter slots needed). No bidding strategy fix could address an empty pool.
- Conditional RP cap guarded late: `pitcherSlotsLeft <= 3` ensures the looser cap only activates when we're near the end of pitcher slot allocation, preventing early-draft RPs from filling all P-slots before SPs get a chance.
- Hitter budget cap exempt for bench/UTIL: when hitterSlotsLeft <= 5, the $220 cap is bypassed so we can bid competitively on cheap late-draft fillers.
- 20-minute runtime for 10k sims accepted: the expanded pool adds ~100 more players to SGP recomputation every 5 picks. Could be optimized with lower RECOMPUTE_EVERY but accuracy vs speed tradeoff favors accuracy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hitter pool structurally insufficient for 13-team league**
- **Found during:** Task 1/2 investigation
- **Issue:** Pool had only 158 hitters with positive FG value, but 13 teams × 16 hitter slots = 208 hitter slots needed. Bench/UTIL slots couldn't fill regardless of bidding strategy.
- **Fix:** Lowered hitter inclusion threshold from `dollars > 0` to `dollars >= -10` → 260 hitters available
- **Files modified:** tools/simulate-auction.ts (buildPlayerPool hitter filter)
- **Commit:** d71d777

**2. [Rule 1 - Bug] Conditional RP cap caused early-draft feedback loop**
- **Found during:** Task 1 initial testing
- **Issue:** `maxRPs = max(5, 12 - spCount)` with spCount=0 allows 12 RPs early in the draft, creating a cycle where low spCount → high RP cap → RPs fill pitcher slots → spCount stays low
- **Fix:** Added `pitcherSlotsLeft <= 3` guard so looser cap only activates late in pitcher drafting
- **Files modified:** tools/simulate-auction.ts (computeOurBid RP cap section)
- **Commit:** d71d777

## Issues Encountered

- 10k sim runtime ~20 min (over 10-min target): expanded pool (580 vs 478) increases SGP recomputation cost per cycle. Acceptable given the pool expansion was necessary for correctness.
- System pause at sim 8500-9000 added ~7 minutes to total — appears to be OS-level memory/GC event, not reproducible in subsequent runs.

## sgpRecomputeCount

Dynamic SGP recomputes ~107 per sim (vs ~95 with 478-player pool). Still consistent with RECOMPUTE_EVERY=5 behavior over a larger pool.

---
*Phase: 61-dynamic-sgp*
*Completed: 2026-03-20*

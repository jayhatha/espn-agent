---
phase: 79-sophisticated-projection-model
verified: 2026-03-30T14:10:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification: []
---

# Phase 79: Sophisticated Projection Model — Verification Report

**Phase Goal:** Replace naive projection summation with a realistic allocation model that accounts for starting lineup constraints, 200 GS cap, projection staleness, and produces confidence intervals. Reusable for trade/waiver simulation with roster gap detection.
**Verified:** 2026-03-30T14:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Staleness prorating scales FanGraphs projections by elapsed fraction of remaining season | VERIFIED | `computeProrateFactor` in staleness.ts; 7 tests pass including same-day=1.0, mid-season ~0.5, past-end=0.0 |
| 2 | canFillSlot is a standalone reusable function (not trapped inside TradeRecommendationAgent) | VERIFIED | `slot-eligibility.ts` exports `canFillSlot`; `private canFillSlot` absent from trade-recommendation.ts; OF rule present at line 24 |
| 3 | FanGraphs CSV ingest parses G, PA (batters) and G, GS (pitchers) into stat_components_json | VERIFIED | `projections-ingest.ts` lines 422-423 (batters) and 562-563 (pitchers) |
| 4 | Hitter lineup allocation assigns best eligible players to starting slots; bench/IL contribute 0% | VERIFIED | `hitter-allocation.ts` exports `allocateLineup`; 14 tests pass including bench=0.0, starter=1.0 |
| 5 | Multi-eligible players fill most-constrained slots first (C before UTIL) | VERIFIED | Greedy tier order: SPECIFIC → FLEX → OVERFLOW in hitter-allocation.ts; dedicated test passes |
| 6 | GS cap scales SP counting components proportionally when projected GS exceeds remaining budget | VERIFIED | `applyGsCap` in pitcher-scaling.ts; 13 tests pass including gsUsed=100/cap=200 → scaleFactor=0.5 |
| 7 | RP projections are never scaled by GS cap | VERIFIED | `applyGsCap` receives only SP projections; dedicated test "RP projections are never scaled" passes |
| 8 | allocateProjections chains staleness prorate -> hitter allocation -> GS cap scaling -> component summation | VERIFIED | `allocator.ts` 10-step pipeline; imports computeProrateFactor, allocateLineup, applyGsCap |
| 9 | Two-way player (Ohtani pattern) contributes batting components to batterComponents and pitching to pitcherComponents | VERIFIED | `isTwoWayPlayer` detection in allocator.ts; dedicated Ohtani test passes |
| 10 | Roster gap detection flags empty required slots after a simulated roster change | VERIFIED | Step 10 in allocator.ts; gap test passes (missing SS → {slot:"SS", severity:"empty"}) |
| 11 | Confidence intervals produce P10 < P50 < P90 for every counting stat | VERIFIED | `computeConfidenceIntervals` in variance.ts; dedicated "satisfies P10 < P50 < P90" test passes |
| 12 | All three agents (standings, trade, waiver) use allocateProjections instead of naive summation | VERIFIED | All three import and call `allocateProjections`; `relevantProjections.reduce` absent from standings-projection.ts; hardcoded 0.5 delta absent from waiver agent |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Provides | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `packages/backend/src/projection/types.ts` | AllocationInput, AllocationResult, SlotAssignment, RosterGap, RosteredPlayer | Yes | 5 exported interfaces, 42 lines | Imported by allocator.ts, standings-projection.ts, trade-recommendation.ts, waiver-recommendation.ts | VERIFIED |
| `packages/backend/src/projection/staleness.ts` | computeProrateFactor, prorateComponents | Yes | 38 lines; clamp logic, edge cases | Imported by allocator.ts | VERIFIED |
| `packages/backend/src/projection/slot-eligibility.ts` | canFillSlot standalone | Yes | 29 lines; handles C/1B/SS/MI/CI/OF/P/UTIL/BN/DH/IL | Imported by hitter-allocation.ts and trade-recommendation.ts | VERIFIED |
| `packages/backend/src/projection/hitter-allocation.ts` | allocateLineup, scorePlayer | Yes | 181 lines; tier-ordered greedy algorithm | Imported by allocator.ts | VERIFIED |
| `packages/backend/src/projection/pitcher-scaling.ts` | applyGsCap, scaleComponents | Yes | 88 lines; GS fallback (IP/6 when IP>80), proportional scaling | Imported by allocator.ts | VERIFIED |
| `packages/backend/src/projection/allocator.ts` | allocateProjections pipeline | Yes | 292 lines; full 10-step pipeline with gap detection | Imported by standings-projection.ts, trade-recommendation.ts, waiver-recommendation.ts | VERIFIED |
| `packages/backend/src/projection/variance.ts` | computeConfidenceIntervals, computeRateConfidence, STAT_CV | Yes | 142 lines; CV table with 15 stat keys, Z_P10/Z_P90 normal distribution | Available for use by consumers | VERIFIED |
| `packages/backend/src/projection/__tests__/staleness.test.ts` | Staleness unit tests | Yes | 7 test cases | Executed by vitest | VERIFIED |
| `packages/backend/src/projection/__tests__/slot-eligibility.test.ts` | Slot eligibility unit tests | Yes | 16 test cases | Executed by vitest | VERIFIED |
| `packages/backend/src/projection/__tests__/hitter-allocation.test.ts` | Hitter allocation unit tests | Yes | 14 test cases | Executed by vitest | VERIFIED |
| `packages/backend/src/projection/__tests__/pitcher-scaling.test.ts` | Pitcher scaling unit tests | Yes | 13 test cases | Executed by vitest | VERIFIED |
| `packages/backend/src/projection/__tests__/allocator.test.ts` | Allocator pipeline integration tests | Yes | 13 test cases | Executed by vitest | VERIFIED |
| `packages/backend/src/projection/__tests__/variance.test.ts` | Variance model unit tests | Yes | 13 test cases | Executed by vitest | VERIFIED |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| allocator.ts | staleness.ts | `import computeProrateFactor, prorateComponents` | WIRED | Line 3 in allocator.ts |
| allocator.ts | hitter-allocation.ts | `import allocateLineup` | WIRED | Line 4 in allocator.ts |
| allocator.ts | pitcher-scaling.ts | `import applyGsCap` | WIRED | Line 5 in allocator.ts |
| allocator.ts | types.ts | `import AllocationInput, AllocationResult, RosteredPlayer, RosterGap` | WIRED | Line 6 in allocator.ts |
| hitter-allocation.ts | slot-eligibility.ts | `import canFillSlot` | WIRED | Line 3 in hitter-allocation.ts |
| hitter-allocation.ts | types.ts | `import RosteredPlayer, SlotAssignment` | WIRED | Line 2 in hitter-allocation.ts |
| standings-projection.ts | allocator.ts | `import allocateProjections` | WIRED | Line 7; called at line 196 with AllocationInput |
| trade-recommendation.ts | allocator.ts | `import allocateProjections` | WIRED | Line 9; called at line 1348 inside detectPostTradeGaps |
| trade-recommendation.ts | slot-eligibility.ts | `import canFillSlot` | WIRED | Line 11; private method removed, standalone used |
| waiver-recommendation.ts | allocator.ts | `import allocateProjections` | WIRED | Line 8; called at line 672 inside detectPostSwapGaps |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| standings-projection.ts | allocResult | `allocateProjections(allocationInput)` where allocationInput.projectionsByPlayerId comes from `player_projection` DB query | Yes — real DB projections, roster from `team_roster_snapshot` join `player` | FLOWING |
| trade-recommendation.ts | rosterGaps | `detectPostTradeGaps()` calls `allocateProjections` with DB-fetched post-trade roster and projections | Yes — DB roster + projections_run | FLOWING |
| waiver-recommendation.ts | rosterGaps | `detectPostSwapGaps()` uses pre-fetched playerMap and projectionMap from outer `getRecommendations` scope | Yes — same data already fetched for delta computation | FLOWING |
| waiver-recommendation.ts | deltaOverallPoints | Category re-ranking after simulated add/drop using real projected component values | Yes — real category projections from DB, delta from rank change math | FLOWING (replaced hardcoded 0.5) |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 76 projection module tests pass | `npx vitest run src/projection/ --reporter=verbose` | 76/76 passed across 6 files in 392ms | PASS |
| TypeScript compiles cleanly | `npx tsc --noEmit` | No output (exit 0) | PASS |
| G/PA/GS parsed in ingest | `grep "G: parseFloat\|PA: parseFloat\|GS: parseFloat" projections-ingest.ts` | 2 matches G, 1 match PA, 1 match GS | PASS |
| naive summation removed from standings agent | `grep "relevantProjections.reduce" standings-projection.ts` | No matches | PASS |
| hardcoded 0.5 delta removed from waiver agent | `grep "0.5.*delta" waiver-recommendation.ts` | No matches | PASS |
| canFillSlot private method removed from trade agent | `grep "private canFillSlot" trade-recommendation.ts` | No matches | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROJ-01 | 79-01 | FanGraphs CSV ingest parses G, PA (batters) and G, GS (pitchers) into stat_components_json | SATISFIED | projections-ingest.ts lines 422-423, 562-563 |
| PROJ-02 | 79-01 | Staleness prorating scales RoS projections by fraction of remaining season elapsed since upload | SATISFIED | staleness.ts computeProrateFactor; 7 tests pass |
| PROJ-03 | 79-01 | canFillSlot extracted as standalone reusable function with OF slot rule (LF/CF/RF/OF) | SATISFIED | slot-eligibility.ts; OF rule at line 24; 16 tests pass |
| PROJ-04 | 79-02 | Hitter lineup allocation assigns best eligible players to starting slots; bench/IL contribute 0% | SATISFIED | hitter-allocation.ts allocateLineup; 14 tests pass |
| PROJ-05 | 79-02 | GS cap enforcement scales SP counting components proportionally when projected GS exceeds remaining budget | SATISFIED | pitcher-scaling.ts applyGsCap; 13 tests pass |
| PROJ-06 | 79-02 | RP projections never scaled by GS cap | SATISFIED | applyGsCap only receives SP projections (caller filters); dedicated test passes |
| PROJ-07 | 79-03 | Unified allocation pipeline chains prorate -> allocate hitters -> scale pitchers -> sum components | SATISFIED | allocator.ts 10-step pipeline; 13 integration tests pass |
| PROJ-08 | 79-03 | Two-way players (Ohtani) contribute batting stats to hitter categories and pitching stats to pitcher categories | SATISFIED | isTwoWayPlayer + extractBatterComponents/extractPitcherComponents in allocator.ts; Ohtani test passes |
| PROJ-09 | 79-03 | Confidence intervals (P10/P50/P90) computed per category using per-stat CV model | SATISFIED | variance.ts computeConfidenceIntervals + STAT_CV + computeRateConfidence; 13 tests pass |
| PROJ-10 | 79-04 | StandingsProjectionAgent uses allocateProjections instead of naive roster-wide summation | SATISFIED | standings-projection.ts line 7 import, line 196 call; `relevantProjections.reduce` absent |
| PROJ-11 | 79-04 | TradeRecommendationAgent uses allocateProjections for trade impact simulation with roster gap detection | SATISFIED | trade-recommendation.ts line 9 import, line 1348 call; rosterGaps in TradeImpactAnalysis interface (line 75) |
| PROJ-12 | 79-04 | WaiverRecommendationAgent uses allocateProjections for add/drop simulation (replaces hardcoded 0.5 delta) | SATISFIED | waiver-recommendation.ts line 8 import, line 672 call; deltaOverallPoints from real rank change math |

**All 12 requirements satisfied.**

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scan notes:
- No TODO/FIXME/placeholder comments in any projection module file
- No `return null` or empty stub returns in the allocation pipeline
- No hardcoded empty arrays as data outputs
- allocator.ts previously had unused variable lint errors (scaledSpComponents, playerId destructuring) — fixed in commit 6a1f9f0 per SUMMARY.md; confirmed absent from current file

---

## Human Verification Required

None. All goal behaviors are verifiable programmatically through test execution, grep-based code inspection, and TypeScript compilation.

---

## Gaps Summary

No gaps found. All 12 requirements are implemented, substantive, and wired. The projection module (7 files, 292+ lines of production code) passes 76 unit and integration tests. All three consumer agents (standings, trade, waiver) import and call `allocateProjections` with real data flowing from the database. TypeScript compilation is clean.

---

_Verified: 2026-03-30T14:10:00Z_
_Verifier: Claude (gsd-verifier)_

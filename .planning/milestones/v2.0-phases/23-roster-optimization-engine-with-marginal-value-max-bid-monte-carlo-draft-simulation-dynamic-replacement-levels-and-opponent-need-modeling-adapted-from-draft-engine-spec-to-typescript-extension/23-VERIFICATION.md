---
phase: 23-roster-optimization-engine
verified: 2026-03-05T10:25:00Z
status: human_needed
score: 6/7 must-haves verified
human_verification:
  - test: "Run auction draft with 100ms performance budget"
    expected: "Full engine cycle including roster optimization step completes in under 100ms; console.debug shows optimization step time under budget"
    why_human: "Cannot benchmark live browser performance programmatically; requires real draft session with performance panel open"
---

# Phase 23: Roster Optimization Engine Verification Report

**Phase Goal:** The extension sidebar provides a data-driven SGP-based max-bid recommendation for every nominated player in an auction draft, backed by greedy roster optimization, Monte Carlo simulation of remaining draft outcomes, and opponent need awareness — all running as pure TypeScript functions within the 100ms performance budget

**Verified:** 2026-03-05T10:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | buildSGPVectors computes per-category mean, stddev, and replacement value for a player pool in a single vectorized pass | VERIFIED | `sgp.ts` lines 86-129: two O(n) phases — stat vector extraction then per-category stats; no nested player loops inside category loop; 16 tests pass |
| 2 | computePlayerSGPs returns a total SGP value per player that correctly inverts sign for LOWER_BETTER categories (ERA, WHIP) | VERIFIED | `sgp.ts` lines 158-163: `if (isLowerBetter) { sgpContribution = -sgpContribution; }` — explicit negation; ERA test in sgp.test.ts verifies ace pitcher with ERA 2.50 produces positive SGP contribution |
| 3 | computeReplacementLevel returns the SGP of the (N+1)th best player at a position, where N = slotsPerTeam * totalTeams | VERIFIED | `sgp.ts` lines 120-127: sorts ascending for LOWER_BETTER, descending for HIGHER_BETTER; replacement index = `totalSlots * totalTeams`; clamps to pool length |
| 4 | optimizeRoster fills roster slots greedily by SGP/$ ratio, respecting dedicated-first then flex-slot assignment order | VERIFIED | `roster-optimizer.ts` lines 22-95: SLOT_PRIORITY array (C→SS→2B→...→BN), FLEX_ELIGIBILITY map, findBestSlot checks dedicated before flex; 15 tests pass including position constraint and flex slot tests |
| 5 | computeMaxBid returns the highest bid price where adding the nominated player still improves total roster SGP vs. baseline; binary search converges in O(log budget) steps; buildOpponentModel computes competition factors; runMonteCarlo produces bid/pass EV comparison without mutating player pool | VERIFIED | `bid-optimizer.ts`: binary search `lo/hi` with `(lo + hi + 1) >> 1` converges; `opponent-model.ts`: competition factors = `teamsNeedingPos / totalTeams`; `monte-carlo.ts`: uses `Set<number>` index tracking, never splices arrays; all tests pass (5+12+8) |
| 6 | computeDraftEngine returns a RosterOptimizationSignal alongside existing signals; two-level cache prevents redundant recomputation; AuctionBudgetTracker shows SGP max bid with BID/PASS badge; EngineInsights shows Top Targets section collapsed by default | VERIFIED | `engine/index.ts`: step 7 produces `optimization: RosterOptimizationSignal | null`; `sgpCacheKey` (allPicks.length) + `bidCacheKey` (playerId + pickCount); `AuctionBudgetTracker.tsx` line 47-113: SGP max bid replaces heuristic, BID/PASS badge; `EngineInsights.tsx` line 69: `<details className="group">` (no `open` = collapsed) |
| 7 | Full engine cycle completes within 100ms performance budget (logged when exceeded) | UNCERTAIN | `console.debug` at optimization step (line 238 in index.ts). However the full-engine warning threshold is 300ms (pre-existing), not 100ms. The plan explicitly kept 300ms for full engine and added debug log for optimization step. Runtime performance cannot be verified without a live browser session. |

**Score:** 6/7 truths fully verified (1 needs human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/extension/lib/engine/sgp.ts` | Vectorized SGP computation, dynamic replacement levels, scarcity adjustment | VERIFIED | 209 lines; exports `buildSGPVectors`, `applyScarcityAdjustment`, `getPlayerStat`; imports types from `./types` |
| `packages/extension/lib/engine/roster-optimizer.ts` | Greedy knapsack with position-aware slot assignment | VERIFIED | 216 lines; exports `optimizeRoster`; SLOT_PRIORITY + FLEX_ELIGIBILITY constants; locked player support |
| `packages/extension/lib/engine/bid-optimizer.ts` | Binary-search max bid computation | VERIFIED | 192 lines; exports `computeMaxBid`; imports `optimizeRoster` and `estimateMarketPrice` |
| `packages/extension/lib/engine/opponent-model.ts` | Opponent need tracking and market price estimation | VERIFIED | 293 lines; exports `buildOpponentModel`, `estimateMarketPrice`, `computePositionCompetition`; `leagueInflationFactor` uses passed parameter (not hardcoded) |
| `packages/extension/lib/engine/monte-carlo.ts` | Monte Carlo draft simulation | VERIFIED | 328 lines; exports `runMonteCarlo`; index-Set-based simulation, no array mutation; imports `optimizeRoster` |
| `packages/extension/lib/engine/index.ts` | computeDraftEngine with roster optimization step 7 | VERIFIED | `computeRosterOptimization` function present; step 7 wrapped in try/catch; two-level cache implemented; imports all Phase 23 modules |
| `packages/extension/lib/engine/types.ts` | All Phase 23 types: PoolPlayer, SGPVectors, CategoryStats, RosterOptimizationResult, BidOptimizerResult, OpponentModel, TargetRecommendation, MonteCarloResult, RosterOptimizationSignal on DraftEngineSignals | VERIFIED | All types present; `DraftEngineSignals.optimization: RosterOptimizationSignal | null` added |
| `packages/extension/lib/engine/archetype.ts` | buildFgPlayerPool exported; normalizeName exported; uses shared PoolPlayer from types.ts; positions field populated | VERIFIED | `export function buildFgPlayerPool` (line 46); `export function normalizeName` (line 29); `import type { ... PoolPlayer } from "./types"` (line 19); no local PoolPlayer interface |
| `packages/extension/components/AuctionBudgetTracker.tsx` | SGP max bid with BID/PASS badge, expected market price, value surplus; fallback to heuristic when optimization=null | VERIFIED | Lines 47-51: SGP max bid with heuristic fallback chain; lines 105-113: BID/PASS badge; lines 145-165: expected market price + value surplus rows |
| `packages/extension/components/EngineInsights.tsx` | Top Targets section (collapsed by default) with player recommendations and MC EV summary | VERIFIED | Lines 68-108: `<details className="group">` (no `open`, collapsed by default); renders up to 3 targets; MC EV + stddev displayed |
| `packages/extension/lib/__tests__/sgp.test.ts` | 16 unit tests for SGP model | VERIFIED | 16 tests pass: counting/rate stats, LOWER_BETTER inversion, scarcity adjustment, edge cases, calibration |
| `packages/extension/lib/__tests__/roster-optimizer.test.ts` | 15 unit tests for roster optimizer | VERIFIED | 15 tests pass: position constraints, flex slots, locked players, budget exhaustion, edge cases |
| `packages/extension/lib/__tests__/opponent-model.test.ts` | 12 unit tests for opponent model | VERIFIED | 12 tests pass; includes test that `leagueInflationFactor` is not hardcoded to 1.0 |
| `packages/extension/lib/__tests__/bid-optimizer.test.ts` | 5 unit tests for bid optimizer | VERIFIED | 5 tests pass: binary search convergence, replacement-level, not-in-pool, valueSurplus |
| `packages/extension/lib/__tests__/monte-carlo.test.ts` | 8 unit tests for Monte Carlo | VERIFIED | 8 tests pass: basic sim, bid>pass, pass>bid, reproducibility, edge cases, mutation guard, performance |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/sgp.ts` | `engine/types.ts` | `import type { PoolPlayer, CategoryStats, SGPVectors }` | WIRED | Line 15 in sgp.ts |
| `engine/roster-optimizer.ts` | `engine/types.ts` | `import type { PoolPlayer, RosterOptimizationResult }` | WIRED | Line 12 in roster-optimizer.ts |
| `engine/bid-optimizer.ts` | `engine/roster-optimizer.ts` | `import { optimizeRoster }` | WIRED | Line 17 in bid-optimizer.ts; used in binary search loop |
| `engine/bid-optimizer.ts` | `engine/sgp.ts` | Uses `SGPVectors` type via `sgpValues: number[]` param | WIRED | SGPVectors.playerSGPs passed as `sgpValues` from index.ts |
| `engine/monte-carlo.ts` | `engine/roster-optimizer.ts` | `import { optimizeRoster }` | WIRED | Line 19 in monte-carlo.ts; used in `simulateOneDraft` |
| `engine/index.ts` | `engine/sgp.ts` | `import { buildSGPVectors }` | WIRED | Line 8 in index.ts; called in `computeRosterOptimization` |
| `engine/index.ts` | `engine/bid-optimizer.ts` | `import { computeMaxBid }` | WIRED | Line 10 in index.ts; called for nominated player |
| `engine/index.ts` | `engine/monte-carlo.ts` | `import { runMonteCarlo }` | WIRED | Line 12 in index.ts; called with 200 simulations |
| `engine/index.ts` | `engine/archetype.ts` | `import { buildFgPlayerPool, normalizeName }` | WIRED | Line 7 in index.ts; used to build player pool |
| `components/AuctionBudgetTracker.tsx` | `engine/types.ts` | Reads `RosterOptimizationSignal` via `engineSignals.optimization` | WIRED | Lines 28, 47-51, 105-165 in AuctionBudgetTracker.tsx |
| `components/EngineInsights.tsx` | `engine/types.ts` | Reads `optimization.topTargets`, `simulationEV`, `simulationStdDev` | WIRED | Lines 14, 33, 102 in EngineInsights.tsx |

### Requirements Coverage

No formal requirement IDs declared in any Phase 23 plan's `requirements` field. All plans have `requirements: []`. No REQUIREMENTS.md entries for this phase to cross-reference. Coverage is established through must-haves and success criteria only.

### Anti-Patterns Found

| File | Location | Pattern | Severity | Impact |
|------|----------|---------|---------|--------|
| `packages/extension/lib/engine/opponent-model.ts` | Lines 39-66 | `getFilledPositions` function defined but never called; contains `return false` dead code inside `find` callback that prevents it from ever matching | Warning | Harmless dead code; does not affect runtime behavior since function is unused. The actual position-filling logic is handled inline in `buildOpponentModel` via pick-index-as-pool-index approach. |

No blocker anti-patterns found. The dead code in `opponent-model.ts` is an orphaned helper from an early implementation attempt that was superseded by the inline approach.

### Human Verification Required

#### 1. 100ms Performance Budget

**Test:** Open the Chrome extension during a live auction draft with 10+ picks already made. Open DevTools Performance panel. Observe `[DraftEngine] Roster optimization step:` console.debug messages.

**Expected:** Optimization step completes in under 100ms per engine recompute. With 200 Monte Carlo simulations and ~200 available players, typical runtime should be 20-50ms in V8.

**Why human:** Browser-environment timing cannot be verified by static analysis. Performance depends on available player pool size, number of simulations, and Chrome V8 JIT behavior.

#### 2. SGP Max Bid Display During Live Nomination

**Test:** During an auction draft, when a player is nominated (currentAuctionPlayerId set), verify the AuctionBudgetTracker shows the SGP-based max bid with BID/PASS badge instead of the heuristic 40% max bid.

**Expected:** Max bid changes from the heuristic value to an SGP-computed value. BID/PASS badge appears. Expected Market Price and Value Surplus rows appear below the bid amount.

**Why human:** Requires ESPN draft page with real DOM scraping populating `currentAuctionPlayerId`.

#### 3. Top Targets Section Populates

**Test:** During an auction draft with FanGraphs data loaded and at least some picks made, open the EngineInsights panel and expand the "Top Targets" section.

**Expected:** Up to 3 player rows appear with name, position, SGP value badge, and expected price. MC Simulation EV line shows at the bottom.

**Why human:** Requires live FanGraphs data to be loaded in extension and auction format to be active.

### Gaps Summary

No gaps found. All automated checks pass.

**Note on performance warning threshold:** The full-engine performance warning fires at 300ms (pre-existing from Phase 20). The Phase 23 plan explicitly specified "keep the existing 300ms warn" and add a separate `console.debug` for the optimization step — both are implemented correctly. The 100ms goal from the phase description is a runtime performance target, not a warning threshold. This is a human verification item, not a gap.

**Note on dead code:** `getFilledPositions` in `opponent-model.ts` is a vestigial helper that is never called. It does not affect correctness, tests, or the optimization signal. It is a warning-level finding only.

---

_Verified: 2026-03-05T10:25:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 28-forward-looking-draft-simulation
verified: 2026-03-06T08:30:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
human_verification:
  - test: "Verify Win Probability section renders during a live auction draft"
    expected: "Win Probability section appears between Inflation and Shopping List sections with expected finish number and probability bars for win, top-3, and top-6"
    why_human: "Requires real ESPN draft page with 10%+ picks made and myTeamId detected; sidebar rendering cannot be verified statically"
  - test: "Verify Decision Comparison appears when a player is nominated"
    expected: "Inside the Win Probability collapsible, a Bid vs Pass subsection shows both options side by side with the recommended action highlighted by a ring and checkmark"
    why_human: "Requires live draft state with currentAuctionPlayerId set and maxBid > 0"
  - test: "Verify Nomination Strategy section appears collapsed at sidebar bottom"
    expected: "Collapsed 'Nomination Strategy' section shows 3-5 trap nominations with player name, reason string, dollar drain estimate, and color-coded trap score"
    why_human: "Requires live draft state with oppStates.length > 0 and available players"
  - test: "Verify simulation completes under 1 second in production extension context"
    expected: "computeTimeMs in the simulation signal is under 1000; no warnings logged in the console"
    why_human: "Extension context uses WXT runtime; real Chrome timing may differ from vitest environment"
---

# Phase 28: Forward-Looking Draft Simulation Verification Report

**Phase Goal:** Evolve the single-pick Monte Carlo engine into a full draft completion simulator that evaluates decisions by their impact on projected roto standings, produces win probability distributions, and recommends trap nominations to drain opponent budgets — all running as pure client-side TypeScript functions within a 1-second performance budget in the Chrome extension sidebar

**Verified:** 2026-03-06T08:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Full draft completion simulation runs 300 iterations of all remaining picks using softmax-weighted selection per team | VERIFIED | `simulateFullDraft` in draft-simulator.ts implements round-robin softmax loop; performance test in draft-simulator.test.ts confirms 300 sims under 1 second (test file ran in 445ms total) |
| 2 | Decisions evaluated by simulated standings impact (expected finish, win probability, top-3%) not raw SGP | VERIFIED | `compareDecisions` + `aggregateOutcomes` in decision-comparison.ts produce `SimulationOutcome` with `expectedFinish`, `winProbability`, `top3Probability`; wired into Step 7 of `computeDraftEngine` |
| 3 | Bid vs pass comparison produces empirical outcome distributions for each candidate action | VERIFIED | `compareDecisions` clones state, applies bid or pass mutation, runs `simsPerDecision` full drafts per action, collects roto pts, calls `aggregateOutcomes`; 11 tests verify correctness |
| 4 | Nomination strategy identifies trap nominations that drain opponent budgets without benefiting the user | VERIFIED | `recommendNomination` in nomination-strategy.ts scores by budget drain (0-0.4), opponent need (0-0.3), and my non-need (0-0.3); returns sorted top-N; 4 tests pass |
| 5 | Win probability, decision comparison, and nomination strategy displayed in sidebar | VERIFIED | EngineInsights.tsx contains Win Probability section (open, with probability bars), Decision Comparison embedded within it, and Nomination Strategy section (collapsed) — all null-guarded |
| 6 | Simulation results cached and invalidated on pick count + nomination change | VERIFIED | `simulationCacheKey = allPicks.length + '_' + currentAuctionPlayerId`; `cachedSimulation` checked before recomputing in index.ts lines 676-677 |
| 7 | All simulation code is pure functions (no Zustand, no DOM) running under 1 second | VERIFIED | All three files (draft-simulator.ts, decision-comparison.ts, nomination-strategy.ts) declare "no Zustand, no DOM" in headers; performance test confirms < 1 second |
| 8 | Rate stats in standings use component-based math via calculateFinalRate (never averaged) | VERIFIED | `computeSimStandings` imports `calculateFinalRate` from `@espn-fantasy/shared` and calls it for RATE category types using `team.componentTotals`; IP=0 guard prevents division errors |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/extension/lib/engine/draft-simulator.ts` | `simulateFullDraft`, `softmaxSelect`, `cloneSimState`, `draftPlayerToTeam`, `computeSimStandings` | VERIFIED | All 5 functions exported; 374 lines of substantive implementation; imports `calculateFinalRate` from shared |
| `packages/extension/lib/engine/decision-comparison.ts` | `compareDecisions`, `aggregateOutcomes` | VERIFIED | Both functions exported; 216 lines; imports from draft-simulator.ts |
| `packages/extension/lib/engine/types.ts` | `SimDraftState`, `SimTeamState`, `SimulationOutcome`, `CandidateAction`, `DecisionComparison`, `NominationRecommendation`, `ForwardSimulationSignal`; `simulation` in `DraftEngineSignals` | VERIFIED | All 7 types present; `DraftEngineSignals.simulation: ForwardSimulationSignal | null` confirmed at line 208 |
| `packages/extension/lib/engine/nomination-strategy.ts` | `recommendNomination` | VERIFIED | Exported; 135 lines; three-factor heuristic scoring implemented |
| `packages/extension/lib/engine/index.ts` | Step 7 wired, cache, `buildSimDraftState`, re-exports | VERIFIED | Step 7 at lines 672-779; cache vars at lines 91-92; `buildSimDraftState` at lines 109-189; re-exports include all 4 new types |
| `packages/extension/components/EngineInsights.tsx` | Win Probability, Decision Comparison, Nomination Strategy sections | VERIFIED | All three sections present; null-guarded; simulation destructured at line 14 |
| `packages/extension/lib/__tests__/draft-simulator.test.ts` | 10+ tests covering full draft, softmax, standings, performance | VERIFIED | 14 tests; includes performance test at < 1000ms |
| `packages/extension/lib/__tests__/decision-comparison.test.ts` | 7+ tests for compareDecisions, aggregateOutcomes | VERIFIED | 11 tests; covers win probability, expected finish, bid vs pass recommendation |
| `packages/extension/lib/__tests__/nomination-strategy.test.ts` | 4 tests for sort order, empty, topN, reason strings | VERIFIED | 4 tests; all pass |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `draft-simulator.ts` | `types.ts` | `import SimDraftState, SimTeamState, PoolPlayer` | VERIFIED | Line 24: `import type { PoolPlayer, SimDraftState, SimTeamState } from "./types"` |
| `draft-simulator.ts` | `@espn-fantasy/shared` | `calculateFinalRate` for rate stats | VERIFIED | Lines 22-23: `import type { Category }` and `import { calculateFinalRate }` from shared; used at line 282 |
| `decision-comparison.ts` | `draft-simulator.ts` | calls `simulateFullDraft` in loop | VERIFIED | Line 190: `simulateFullDraft(players, sgpValues, categories, actionState, temperature)` inside `for (let s = 0; s < simsPerDecision; s++)` |
| `index.ts` | `decision-comparison.ts` | `compareDecisions`, `aggregateOutcomes` | VERIFIED | Line 17: `import { compareDecisions, aggregateOutcomes } from "./decision-comparison"`; used at lines 717 and 735 |
| `index.ts` | `nomination-strategy.ts` | `recommendNomination` | VERIFIED | Line 18: `import { recommendNomination } from "./nomination-strategy"`; used at line 753 |
| `index.ts` | `draft-simulator.ts` | `simulateFullDraft`, `computeSimStandings` | VERIFIED | Line 16: `import { simulateFullDraft, computeSimStandings } from "./draft-simulator"`; used at lines 710 and 714 |
| `nomination-strategy.ts` | `types.ts` | `PoolPlayer, SimTeamState, OpponentModel, NominationRecommendation` | VERIFIED | Line 18: `import type { PoolPlayer, SimTeamState, OpponentModel, NominationRecommendation } from "./types"` |
| `EngineInsights.tsx` | `types.ts` (via index.ts) | `ForwardSimulationSignal` via `DraftEngineSignals` | VERIFIED | Line 2: `import type { DraftEngineSignals } from "../lib/engine"`; `simulation` destructured at line 14; `simulation?.winProbability` at line 57 |
| `EngineInsights.tsx` | `index.ts` | receives `DraftEngineSignals.simulation` via props | VERIFIED | Pattern `engineSignals.simulation` through destructuring at line 14; `simulation.currentDecision` at line 136 |

---

## Requirements Coverage

SIM requirement IDs are defined in ROADMAP.md (Success Criteria for Phase 28). They are not separately defined in REQUIREMENTS.md (which does not contain SIM-* entries). The IDs map to the 8 Success Criteria directly.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SIM-01 | 28-01 | Full draft completion simulation with softmax selection | SATISFIED | `simulateFullDraft` round-robin softmax loop; 300-sim performance test passes |
| SIM-02 | 28-01 | Decisions evaluated by standings impact (expectedFinish, winProbability, top-3%) | SATISFIED | `SimulationOutcome` type + `aggregateOutcomes` produces all three; `compareDecisions` uses them |
| SIM-03 | 28-01 | Bid vs pass produces empirical outcome distributions | SATISFIED | `compareDecisions` applies action mutation then runs N sims per decision; 11 tests confirm |
| SIM-04 | 28-01 | Rate stats use component-based math via calculateFinalRate | SATISFIED | `computeSimStandings` uses `calculateFinalRate` from `@espn-fantasy/shared` with `componentTotals` |
| SIM-05 | 28-02 | Nomination strategy identifies trap nominations | SATISFIED | `recommendNomination` three-factor heuristic; 4 tests; wired in Step 7 |
| SIM-06 | 28-02 | Simulation wired into engine with cache by pick count + nomination | SATISFIED | Step 7 in `computeDraftEngine`; cache key `allPicks.length_currentAuctionPlayerId` |
| SIM-07 | 28-03 | Win probability, decision comparison, nomination strategy in sidebar | SATISFIED | All three sections in EngineInsights.tsx with null safety |
| SIM-08 | 28-03 | All simulation code is pure functions under 1 second | SATISFIED | No Zustand/DOM in any sim file; performance test < 1000ms confirmed |

**Orphaned requirements:** None. All SIM-01 through SIM-08 are claimed by plans 28-01, 28-02, and 28-03.

---

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `lib/__tests__/draft-simulator.test.ts` | 14 | ALL PASS |
| `lib/__tests__/decision-comparison.test.ts` | 11 | ALL PASS |
| `lib/__tests__/nomination-strategy.test.ts` | 4 | ALL PASS |
| **Phase 28 total** | **29** | **ALL PASS** |

Full test suite: 202 passing, 12 failing. The 12 failing tests are pre-existing failures in `packages/backend/src/adapters/__tests__/espn.test.ts` (rate limiting) and `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` (rate stat component math) — both are out of scope for Phase 28 and pre-date this phase.

**TypeScript:** Zero errors in Phase 28 files. Pre-existing errors in `DraftSidebar.tsx`, `entrypoints/`, `api-client.ts`, and `monte-carlo.test.ts` are out of scope.

---

## Anti-Patterns Scan

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `draft-simulator.ts` | None detected | — | — |
| `decision-comparison.ts` | None detected | — | — |
| `nomination-strategy.ts` | None detected | — | — |
| `index.ts` (Step 7) | None detected | — | — |
| `EngineInsights.tsx` | None detected | — | — |

No TODO/FIXME/placeholder comments, no stub returns (return null/return {}), no empty handlers found in Phase 28 modified files.

---

## Human Verification Required

### 1. Win Probability Section Renders During Live Draft

**Test:** Connect to a real ESPN auction draft with at least 10% of picks made (e.g., 28 of 276 picks in a 12-team, 23-slot league). Open the extension sidebar.
**Expected:** Win Probability collapsible section appears between Inflation and Shopping List, showing a large expected finish number (e.g., "#4"), and three progress bars for Win %, Top 3 %, and Top 6 %.
**Why human:** Requires a live ESPN draft page with `myTeamId` detected and `draftProgressFraction >= 0.1`. The DOM selector and team ID detection are not tested in automated tests.

### 2. Decision Comparison Appears on Nomination

**Test:** When a player is nominated during the live draft, observe the Win Probability section.
**Expected:** A "Bid vs Pass" subsection appears inside the Win Probability collapsible. Both options show expected finish and win % side by side. The recommended action is highlighted with a ring border and checkmark.
**Why human:** Requires `currentAuctionPlayerId` to be non-null and `maxBid > 0` — depends on live ESPN DOM state.

### 3. Nomination Strategy Section Visible

**Test:** Open the collapsed Nomination Strategy section at the bottom of the sidebar during a mid-draft session.
**Expected:** 3-5 player recommendations, each showing player name, reason string (e.g., "Expensive ($38) -- drains opponent budget + You don't need this position"), estimated drain ($), and a numeric trap score (0-100). Scores above 60 appear in green.
**Why human:** Requires `oppStates.length > 0` and available players in the pool — live draft state required.

### 4. Performance Under 1 Second in Real Extension

**Test:** Monitor browser console during a live draft for the warn log `[DraftEngine] Forward simulation took Xms -- exceeds 800ms budget`.
**Expected:** No warning appears. The `computeTimeMs` field in the simulation signal is below 800ms.
**Why human:** The vitest performance test confirms < 1 second in Node.js, but Chrome's V8 JIT and the extension context may differ.

---

## Gaps Summary

No gaps found. All 8 observable truths are verified. All 9 required artifacts exist, are substantive, and are wired. All 8 SIM requirements are satisfied by implementation evidence.

---

_Verified: 2026-03-06T08:30:00Z_
_Verifier: Claude (gsd-verifier)_

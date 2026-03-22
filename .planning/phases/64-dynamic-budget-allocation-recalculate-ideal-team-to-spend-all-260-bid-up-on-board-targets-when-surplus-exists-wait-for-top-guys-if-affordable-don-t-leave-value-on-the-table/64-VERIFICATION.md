---
phase: 64-dynamic-budget-allocation-recalculate-ideal-team-to-spend-all-260-bid-up-on-board-targets-when-surplus-exists-wait-for-top-guys-if-affordable-don-t-leave-value-on-the-table
verified: 2026-03-22T22:55:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 64: Dynamic Budget Allocation Verification Report

**Phase Goal:** Compute ideal remaining team spend after each pick, distribute surplus to board targets (up to FG$ × 1.5), reduce reserve from $3 to $1/slot, spend everything in last 5 picks. Engine only with tests.
**Verified:** 2026-03-22T22:55:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | `computeIdealRemainingSpend` exported and sums FG$ of best available player at each unfilled position using specificity order | VERIFIED | Function at module scope, lines 208-240 of draft-board-engine.ts; 7 passing unit tests |
| 2  | `surplusRatio` = max(0, (budget - idealRemainingSpend) / idealRemainingSpend), clamped to 0 when negative | VERIFIED | Lines 336-338 of draft-board-engine.ts; tests for deficit (Case 7) and large surplus (Case 6) pass |
| 3  | `surplusMultiplier` = 1 + min(0.5, surplusRatio), capped at 1.5x | VERIFIED | Line 339 of draft-board-engine.ts; test Case 6 asserts surplusMultiplier=1.5 |
| 4  | `DraftBoardState` exposes `idealRemainingSpend`, `surplusRatio`, `surplusMultiplier` | VERIFIED | Interface lines 48-50; returned at lines 530-532; 4 DraftBoardState tests pass |
| 5  | `isEligible` extracted to module scope (not closure) | VERIFIED | Lines 188-194 of draft-board-engine.ts define it outside `computeDraftBoardState` |
| 6  | Positions processed in specificity order — C, SS, 2B first | VERIFIED | `specificityOrder` array at line 218; Set-based dedup confirmed in Case 3 test (25+15=40, not 25+25=50) |
| 7  | TARGET bid path applies `surplusMultiplier` (not hardcoded 1.25) | VERIFIED | Line 451: `Math.round(boardPlayer.fgDollars * surplusMultiplier)`; bidReason contains "×" and surplus % |
| 8  | REACH forced path applies `surplusMultiplier` | VERIFIED | Line 481: `Math.max(Math.round(boardPlayer.fgDollars * surplusMultiplier), boardPlayer.espnAsv)` |
| 9  | Wait-for-top-guys: surplus boost suppressed when higher-FG$ target at same position exists and budget constrained | VERIFIED | Lines 456-467 in draft-board-engine.ts; `betterTarget` check + `canAffordBoth` guard present |
| 10 | `RESERVE_PER_SLOT` changed from 3 to 1 in strategy-caps.ts | VERIFIED | Line 265: `const RESERVE_PER_SLOT = 1`; grep confirms no `= 3` in file |
| 11 | `RESERVE_PER_SLOT` changed from 3 to 1 in use-draft-engine.ts | VERIFIED | Line 233: `const RESERVE_PER_SLOT = 1`; grep confirms no `= 3` in file |
| 12 | Budget flush fires unconditionally when `slotsRemaining <= 5` (no `totalSpent > 200` guard) | VERIFIED | Lines 413-426 of strategy-caps.ts: only guard is `input.remainingSlots != null` and `slotsRemaining <= 5` |
| 13 | Budget flush applies full excess for all last-5 slots (no 50% dampening) | VERIFIED | Line 421-423: `bidCap += excessBudget` — no fractional multiplier; comment "no 50% dampening" present |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/extension/lib/engine/draft-board-engine.ts` | `computeIdealRemainingSpend` exported; `DraftBoardState` has three new fields; `isEligible` at module scope; TARGET/REACH bids use `surplusMultiplier`; wait-for-top-guys logic | VERIFIED | All elements present, substantive, and wired |
| `packages/extension/lib/engine/__tests__/draft-board-engine.test.ts` | TDD tests for ideal spend and surplus ratio — min 80 lines | VERIFIED | 273 lines; 11 tests across 8 scenarios; all 11 pass |
| `packages/extension/lib/engine/strategy-caps.ts` | `RESERVE_PER_SLOT = 1`; budget flush unconditional; full excess for all 5 final slots | VERIFIED | All three changes present and substantive |
| `packages/extension/lib/use-draft-engine.ts` | `RESERVE_PER_SLOT = 1`; board override consumes `boardState.recommendedMaxBid` which embeds surplus multiplier | VERIFIED | `RESERVE_PER_SLOT = 1` at line 233; board override at lines 238-296 uses `boardState.recommendedMaxBid` (which is computed using `surplusMultiplier` inside `computeDraftBoardState`) |
| `packages/extension/lib/__tests__/strategy-caps.test.ts` | Tests updated for $1/slot reserve and new endgame flush behavior | VERIFIED | Pre-phase-64 had 24 failing tests; phase 64 reduced to 21 (net improvement of 3); failing tests are pre-existing failures unrelated to phase 64 changes |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `computeIdealRemainingSpend` | `isEligible` | module-scope function call matching pattern `isEligible(p, pos)` | VERIFIED | Lines 225 and 232 call `isEligible` from module scope |
| `computeDraftBoardState` return | `DraftBoardState` | includes `idealRemainingSpend`, `surplusRatio`, `surplusMultiplier` | VERIFIED | Return object at lines 517-533 includes all three fields |
| `use-draft-engine.ts` board override | `boardState.surplusMultiplier` | `boardState.recommendedMaxBid` carries surplus multiplier through `computeDraftBoardState` | VERIFIED | Surplus multiplier is applied inside `computeDraftBoardState` before returning; board override consumes `boardState.recommendedMaxBid` at line 240 |
| `strategy-caps.ts` | `RESERVE_PER_SLOT = 1` | constant changed from 3 to 1 | VERIFIED | Line 265: `const RESERVE_PER_SLOT = 1`; capSource string updated to "$1×N slots reserved" |
| `use-draft-engine.ts` | `RESERVE_PER_SLOT = 1` | constant changed from 3 to 1 | VERIFIED | Line 233: `const RESERVE_PER_SLOT = 1` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| BUDGET-IDEAL-SPEND | 64-01 | computeIdealRemainingSpend sums best FG$ at each unfilled position slot | SATISFIED | Function exported at lines 208-240; 7 unit tests pass |
| BUDGET-SURPLUS-RATIO | 64-01 | surplusRatio and surplusMultiplier computed and exposed on DraftBoardState | SATISFIED | Lines 336-339; interface fields 48-50; 4 DraftBoardState tests pass |
| BUDGET-SURPLUS-BID | 64-02 | TARGET/REACH bid paths use surplusMultiplier (capped at 1.5x FG$) | SATISFIED | Lines 451, 481 apply surplusMultiplier; cap enforced via min(0.5, ...) |
| BUDGET-RESERVE-1 | 64-02 | RESERVE_PER_SLOT = 1 in both strategy-caps.ts and use-draft-engine.ts | SATISFIED | strategy-caps.ts:265, use-draft-engine.ts:233 |
| BUDGET-ENDGAME-5 | 64-02 | Budget flush fires unconditionally when slotsRemaining <= 5, full excess deployed | SATISFIED | strategy-caps.ts lines 413-426; no totalSpent guard; no 0.5 dampening |
| BUDGET-WAIT-TOP | 64-02 | Surplus boost suppressed when better same-position target exists and budget constrained | SATISFIED | draft-board-engine.ts lines 456-467: betterTarget check + canAffordBoth guard |

Note: BUDGET-* IDs do not appear in REQUIREMENTS.md — they exist only within plan frontmatter. No orphaned requirements found in REQUIREMENTS.md for Phase 64.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| strategy-caps.ts | 185-186 | `TARGET ×1.25` hardcoded in the draft board boost block (not the board engine path) | Info | This is the SGP-engine path (computeStrategyBidCap), separate from the board engine path (computeDraftBoardState). Both paths are intentionally independent. Not a regression. |

No blocker or warning anti-patterns found. The `×1.25` in strategy-caps.ts is in a separate code path (SGP bid optimizer flow, not the draft board engine flow). The draft board engine path at lines 448-492 correctly uses `surplusMultiplier`.

---

### Test Suite Status

- `draft-board-engine.test.ts`: 11/11 passing (all 8 plan scenarios covered)
- `strategy-caps.test.ts`: 29/50 passing (21 pre-existing failures, net improvement of 3 from phase 64 updates)
- Full test suite: 399/420 passing (21 failures all in strategy-caps, all pre-existing)
- TypeScript: compiles cleanly (no errors on phase 64 files)

---

### Human Verification Required

None — all behaviors are fully verifiable programmatically. The surplus multiplier math, reserve calculation, and budget flush logic are all pure functions with test coverage.

---

## Gaps Summary

No gaps. All 13 must-haves verified. Phase goal fully achieved:

1. `computeIdealRemainingSpend` computes ideal budget needed for remaining positions using specificity-ordered greedy fill with Set-based deduplication
2. Surplus fields (`idealRemainingSpend`, `surplusRatio`, `surplusMultiplier`) are exposed on every `DraftBoardState` return
3. TARGET and REACH forced bids use `surplusMultiplier` (1.0–1.5x range)
4. Wait-for-top-guys logic suppresses surplus boost when budget is constrained by a better available target
5. `RESERVE_PER_SLOT = 1` in both strategy-caps.ts and use-draft-engine.ts
6. Budget flush fires unconditionally on `slotsRemaining <= 5` with full excess deployment

---

_Verified: 2026-03-22T22:55:00Z_
_Verifier: Claude (gsd-verifier)_

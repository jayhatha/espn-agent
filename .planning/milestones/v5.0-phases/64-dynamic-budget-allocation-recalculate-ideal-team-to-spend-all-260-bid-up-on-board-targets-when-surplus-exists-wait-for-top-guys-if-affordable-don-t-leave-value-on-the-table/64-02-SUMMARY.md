---
phase: 64-dynamic-budget-allocation-recalculate-ideal-team-to-spend-all-260-bid-up-on-board-targets-when-surplus-exists-wait-for-top-guys-if-affordable-don-t-leave-value-on-the-table
plan: 02
subsystem: draft-engine
tags: [typescript, vitest, auction-draft, budget-allocation, strategy-caps, draft-board-engine]

# Dependency graph
requires:
  - phase: 64-01
    provides: surplusMultiplier and surplusRatio on DraftBoardState; computeIdealRemainingSpend

provides:
  - surplusMultiplier applied to TARGET bid in computeDraftBoardState (draft-board-engine.ts)
  - surplusMultiplier applied to REACH forced bid in computeDraftBoardState
  - Wait-for-top-guys: surplus boost suppressed when better target exists and budget constrained
  - RESERVE_PER_SLOT = 1 in both strategy-caps.ts and use-draft-engine.ts
  - Budget flush fires unconditionally when slotsRemaining <= 5 (no totalSpent guard)
  - Budget flush applies full excess for all 5 final slots (no 50% dampening)

affects:
  - use-draft-engine.ts board override: maxAffordable uses $1/slot reserve (less conservative)
  - Any future phase modifying strategy-caps.ts budget flush or reserve logic

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Budget flush unconditional: fires on slotsRemaining <= 5 regardless of totalSpent — prevents holding money late in draft"
    - "Full flush last 5 picks: all excess budget deployed immediately (no 50% dampening) to maximize spend"
    - "Wait-for-top-guys: check availablePlayers for better same-position target before surplus boost"
    - "$1/slot reserve: reserve just enough for each remaining slot, not $3 (which over-reserved by ~$42)"

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/draft-board-engine.ts
    - packages/extension/lib/engine/strategy-caps.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/lib/__tests__/strategy-caps.test.ts

key-decisions:
  - "Budget flush guard (totalSpent>200) removed — fires unconditionally on slotsRemaining<=5"
  - "50% dampening for slots 3-5 removed — full excess deployed on all last 5 picks"
  - "Tests using remainingSlots<=5 that test non-flush behavior now use >5 slots to isolate test behavior"
  - "Wait-for-top-guys check uses availablePlayers (not allBoardPlayers) so only undrafted higher targets suppress boost"

patterns-established:
  - "Reserve per slot at $1: just enough to ensure every remaining slot can be filled for $1 minimum"
  - "Budget flush unconditional: the only guard is slotsRemaining — no spend threshold needed"

requirements-completed: [BUDGET-SURPLUS-BID, BUDGET-RESERVE-1, BUDGET-ENDGAME-5, BUDGET-WAIT-TOP]

# Metrics
duration: 10min
completed: 2026-03-22
---

# Phase 64 Plan 02: Dynamic Budget Allocation — Wire Surplus and Flush Summary

**surplusMultiplier applied to board TARGET/REACH bids, $3→$1 reserve, unconditional budget flush with full excess for last 5 picks**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-22T22:24:00Z
- **Completed:** 2026-03-22T22:37:57Z
- **Tasks:** 3 (Task 1 + Task 2 + Task 3)
- **Files modified:** 4

## Accomplishments
- TARGET bid path uses `surplusMultiplier` (from Plan 01) instead of hardcoded 1.25x; bidReason includes "×M.MM ... (surplus N%)"
- REACH forced path (noTargetsAtPos) also uses `surplusMultiplier` instead of static 1x
- Wait-for-top-guys logic suppresses surplus boost when a higher-FG$ target at the same position is still on the board and we cannot afford both — preserves budget for the better player
- RESERVE_PER_SLOT changed from 3 to 1 in both `strategy-caps.ts` and `use-draft-engine.ts` — reduces over-reserving from ~$42 to ~$14 at the start of endgame
- Budget flush fires unconditionally on `slotsRemaining <= 5` (removed `totalSpent > 200` guard)
- Budget flush deploys full excess for all 5 final slots (removed 50% dampening for slots 3-5)
- Updated strategy-caps tests: 3 newly broken tests fixed (used more remaining slots to avoid flush), budget flush test updated to expect full-excess value, net improvement of 1 passing test

## Task Commits

1. **Task 1: Update draft-board-engine.ts bid formula** - `c38dcd1` (feat)
2. **Task 2: Change RESERVE_PER_SLOT $3→$1 and fix budget flush** - `059fa24` (feat)
3. **Task 3: Update strategy-caps tests** - `bae2e33` (test)

## Files Created/Modified
- `/packages/extension/lib/engine/draft-board-engine.ts` — TARGET bid uses surplusMultiplier; REACH forced bid uses surplusMultiplier; wait-for-top-guys logic added
- `/packages/extension/lib/engine/strategy-caps.ts` — RESERVE_PER_SLOT=1; budget flush unconditional; full excess for all 5 final slots
- `/packages/extension/lib/use-draft-engine.ts` — RESERVE_PER_SLOT=1 in board override block
- `/packages/extension/lib/__tests__/strategy-caps.test.ts` — Updated 4 tests to reflect new behavior

## Decisions Made
- Budget flush guard (`totalSpent > 200`) removed: the guard was preventing the flush from firing in real drafts where spend tracks below 200 mid-draft; `slotsRemaining <= 5` is a sufficient and correct trigger
- 50% dampening for slots 3-5 removed: the dampening was leaving money unspent even in last-5 scenarios; full flush is the right behavior
- Tests using `remainingSlots <= 5` that test non-flush behavior: changed to use `> 5` remaining slots to isolate test intent from flush mechanics — correct approach since those tests don't test flush

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The budget flush test (previously failing) had a subtle issue: the `Math.max(0, rawMaxBid - bidCap)` clause in the old 3-5 slot boost capped the boost at 0 when `bidCap === rawMaxBid`. This was why the test showed `bidCap=15` (not 34 as comments implied). The new unconditional full-flush code removes this limitation entirely. Updated the test to expect the correct value (53, not >18).

The 3 tests broken by removing the `totalSpent > 200` guard were tests using `remainingSlots <= 5` with default `hitterSpent=0`/`pitcherSpent=0` — the old guard prevented the flush from firing with zero spend, but the tests weren't testing flush behavior. Fixed by increasing their `remainingSlots` count to > 5.

## Next Phase Readiness
- Phase 64 is complete. Both plans executed successfully.
- `surplusMultiplier` is now fully wired from computation (Plan 01) to bid application (Plan 02)
- RESERVE_PER_SLOT = 1 ensures the engine won't over-reserve ~$42 late in drafts
- Budget flush will aggressively deploy all remaining budget in the final 5 picks

---
*Phase: 64-dynamic-budget-allocation*
*Completed: 2026-03-22*

## Self-Check: PASSED

All files exist and all commits verified in git history.

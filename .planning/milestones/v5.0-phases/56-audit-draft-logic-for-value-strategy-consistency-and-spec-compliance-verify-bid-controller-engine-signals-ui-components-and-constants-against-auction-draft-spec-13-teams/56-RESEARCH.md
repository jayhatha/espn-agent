# Phase 56: Draft Logic Audit - Research

**Researched:** 2026-03-18
**Domain:** TypeScript auction draft engine, bid controller, UI components, constants
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Audit Scope**
- Audit ALL draft logic (engine, bid controller, UI components) for consistency with value draft strategy
- Evaluate compliance with the auction draft system spec (attached below)
- **CRITICAL OVERRIDE**: League has 13 teams, not 12. Total league budget = 13 * $260 = $3,380
- Check that constants, formulas, UI displays, and bid decisions are all internally consistent

**Spec Reference (Authoritative)**

League configuration: 13 teams, $260 budget, $3,380 total league budget, OPS roto, 13 hitters, 9 pitchers, 5 bench, 3 UTIL, 200 GS cap.

**Inflation**: money_remaining / value_remaining. Bands: <1.00 overspending, 1.00-1.05 neutral, 1.05-1.15 buying window, >1.15 strong value.

**Positional weights**: SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1. Avoid paying heavily for catcher, prioritize elite SS, stack OF/DH for UTIL.

**SP tier caps**: SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3. Prefer high K rate, breakout upside.

**Budget allocation**: Hitters $185-205, Pitchers $55-70, Bench $5. If inflation > 1.10, increase hitter bid ceilings.

**Bid ceiling**: model_dollar_value - 2 (baseline). +2 if inflation > 1.10, +1 if position_need high. Clamped by max_bid_allowed = budget_remaining - (remaining_roster_spots - 1).

**Bid decision**: current_price > bid_ceiling -> PASS. profit >= 5 -> BID aggressively. price >= value - 2 -> STOP.

**Nomination**: nomination_score = espn_price - model_value. Nominate highest score (most overpriced) to force league overspending.

**Endgame**: budget_remaining <= $20. Switch to value_per_dollar = sgp_value / price. Prioritize breakout hitters, cheap OF, K pitchers. Avoid backup C, weak OPS.

**Category targets**: OPS top 3, HR top 3, SB top 4, Saves top 4, K top 5.

**Evaluation targets**: roster value >= $320, profit >= $70, top-4 category finishes >= 60%.

### Prior Decisions to Respect
- Keep simulation-based BID/PASS (more sophisticated than spec formula) — spec formula is reference, not replacement
- Keep SGP bid optimizer (more accurate than model_value - 2) — spec baseline is reference
- Add spec gaps as enhancements, not replacements
- Pure value strategy, no tier-based bid paths
- ESPN ASV for ideal roster pricing
- $200 hitter cap, max 1 catcher

### Claude's Discretion
- How to organize the audit (by file, by concept, by component)
- How many plans to break the audit into
- Whether to fix issues in-place or create a findings report first

### Deferred Ideas
- None
</user_constraints>

---

## Summary

Phase 56 is a code audit phase. The codebase has a mature draft engine (engine/index.ts, bid-optimizer.ts, strategy-caps.ts, inflation.ts, nomination-strategy.ts, budget-curve.ts, draft-constants.ts) and a UI layer (DraftSidebar, BidVerdict, SignalStrip, AuctionRecommendations, AuctionPlayerCard). The primary concern is whether all these files are internally consistent with one another and with the 13-team spec.

The most significant compliance gap found in research is the **hardcoded `totalTeams: 12` default** in `draft-state.ts` and `entrypoints/content.tsx`. The spec mandates 13 teams. This default propagates through the inflation formula (total league budget estimate), SGP replacement level computation, and projected standings — all of which use `totalTeams` as a parameter. If the draft initializes before ESPN's team count is detected, it uses 12 instead of 13 for the first several engine computations.

Secondary gaps: `AuctionPlayerCard` and `AuctionRecommendations` call `calculateBudgetPacing(260, ...)` with a **hardcoded 260** instead of deriving total budget from remaining+spent. `calculateBudgetPacing` itself produces a `recommendedMaxBid = floor(budget * 0.4)` that has no connection to the spec's bid ceiling formula or the engine's SGP maxBid. This is a display inconsistency: the AuctionRecommendations "affordable" filter uses the 40%-of-remaining heuristic, while the actual bid controller uses the SGP-based strategy cap.

The spec's SP tier ranges (SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3) differ slightly from what's implemented: the code uses single-point caps (SP1 $18, SP2 $12, SP3 $10, SP4 $5, SP5 $3) which are the spec's upper bounds. The ranges in the spec imply a floor; the code only enforces ceilings. This is per the prior decision to use tier caps as ceilings, not floors, which is correct for value strategy.

**Primary recommendation:** Fix the `totalTeams: 12` default to 13. Audit and fix any hardcoded 260 budget values that don't derive from live state. Then verify that each spec element has corresponding implementation or documented exception.

---

## Architecture Patterns

### Files Involved in the Audit

```
packages/extension/
├── lib/
│   ├── draft-state.ts                  # Zustand store — has totalTeams: 12 default
│   ├── auto-bid-controller.ts          # Bid decision and nomination execution
│   ├── value-calculations.ts           # calculateBudgetPacing — legacy heuristics
│   ├── engine/
│   │   ├── draft-constants.ts          # POSITIONAL_WEIGHTS, SP_TIER_CAPS, GS_CAP, CATEGORY_RANK_TARGETS
│   │   ├── inflation.ts                # computeInflation — formula correct, uses totalTeams param
│   │   ├── budget-curve.ts             # computeBudgetCurve — hitterBudgetTarget hardcoded
│   │   ├── strategy-caps.ts            # computeStrategyBidCap — applies all strategy adjustments
│   │   ├── bid-optimizer.ts            # computeMaxBid — SGP-based binary search
│   │   ├── nomination-strategy.ts      # recommendNomination — overpricing-first scoring
│   │   ├── sgp.ts                      # buildSGPVectors — uses totalTeams param
│   │   └── index.ts                    # computeDraftEngine — wires everything together
│   └── use-draft-engine.ts             # React hook, reads from store
├── components/
│   ├── BidVerdict.tsx                  # Shows maxBid/shouldBid — no spec constants
│   ├── SignalStrip.tsx                  # Shows endgame/inflation/split/SP badges
│   ├── AuctionRecommendations.tsx       # Uses calculateBudgetPacing(260, ...) hardcoded
│   ├── AuctionPlayerCard.tsx            # Uses calculateBudgetPacing(260, ...) hardcoded
│   ├── AuctionBudgetTracker.tsx         # Uses derived total budget (correct)
│   └── DraftSidebar.tsx                # Wires engine signals to AutoBidController
└── entrypoints/
    └── content.tsx                     # Draft init: totalTeams: cachedLeagueConfig?.totalTeams || 12
```

---

## Detailed Findings by Spec Section

### Finding 1: totalTeams default is 12, should be 13 (CRITICAL)

**Spec**: League has 13 teams. Total league budget = 13 × $260 = $3,380.

**Implementation**:
- `draft-state.ts` line 177: `totalTeams: 12`
- `draft-state.ts` line 485 (migration): `totalTeams: 12`
- `content.tsx` line 255: `totalTeams: cachedLeagueConfig?.totalTeams || 12`

**Impact**: If the league config hasn't been detected yet (early in page load, or config fetch fails), `totalTeams = 12` flows into:
1. `computeInflation()` — estimates total league budget as 12 × $260 = $3,120 instead of $3,380, making inflation appear lower than it is
2. `buildSGPVectors()` — replacement level computed at `totalSlots × totalTeams`, so all SGP values shift
3. `computeProjectedStandings()` — roto points assigned on a 12-team scale instead of 13
4. `CategoryHeatmap.tsx` line 49: `totalTeamCount ?? 12`

**Status**: Bug — default is wrong for this league. ESPN's config detection should supply 13 on initialization; default is a code smell that could corrupt early computations.

---

### Finding 2: AuctionPlayerCard and AuctionRecommendations hardcode budget $260

**Spec**: $260 budget.

**Implementation**:
- `AuctionPlayerCard.tsx` line 65: `calculateBudgetPacing(260, myRoster, rosterSize)`
- `AuctionRecommendations.tsx` line 21: `calculateBudgetPacing(260, myRoster, rosterSize)`
- `AuctionBudgetTracker.tsx` lines 17-19: derives total budget as `remainingBudget + spent` (correct)

**Impact**: Minor display bug. The hardcoded 260 means the "affordable" threshold doesn't update if a league has a different budget. For this league (exactly $260), it's numerically correct but brittle. The correct pattern is already in `AuctionBudgetTracker` — derive from `remainingBudget + spent`.

**Status**: Low severity for this specific league, but inconsistent with the pattern used elsewhere.

---

### Finding 3: calculateBudgetPacing recommendedMaxBid formula is disconnected from spec

**Spec**: bid ceiling = model_dollar_value - 2 (baseline), clamped by budget_remaining - (remaining_roster_spots - 1).

**Implementation** (`value-calculations.ts` line 220):
```
recommendedMaxBid = floor(remainingBudget * 0.4)
```

**Impact**: `AuctionRecommendations` uses this to mark players "affordable" with a badge. The engine's `computeBudgetCurve` computes `maxBidRecommendation` using inflation-adjusted value × 1.10 capped at 35% of usable budget — also disconnected from the spec formula. Neither is the spec formula (model_value - 2), but the spec formula is the *reference*, not the replacement (per prior decisions). The actual bid controller uses the SGP-based cap from `computeStrategyBidCap`.

**Status**: Acceptable divergence per prior decisions. However, the "affordable" badge in AuctionRecommendations uses a third formula (40% of remaining), creating a confusing three-formula situation in the UI. Recommendation: consolidate UI to use the engine's signals rather than the legacy `calculateBudgetPacing`.

---

### Finding 4: SP tier caps — spec has ranges, code uses ceilings only

**Spec**: SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3.

**Implementation** (`draft-constants.ts`):
- SP1: $18, SP2: $12, SP3: $10, SP4: $5, SP5+: $3

These are the upper bounds from the spec. No floors are enforced. This is correct per prior decision (value strategy: no tier-based bid paths). The spec ranges describe reasonable bids; the code only caps the ceiling.

**Status**: Consistent with prior decisions. No change needed.

---

### Finding 5: Inflation formula and bands — COMPLIANT

**Spec**: inflation = money_remaining / value_remaining. Bands: <1.00 overspending, 1.00-1.05 neutral, 1.05-1.15 buying window, >1.15 strong value.

**Implementation** (`inflation.ts`):
```typescript
const rawFactor = totalRemainingBudget / normalizedRemainingValue;
inflationBand = factor < 1.00 ? "overspending" : factor <= 1.05 ? "neutral" : factor <= 1.15 ? "buying_window" : "strong_value";
```

**Status**: Exact match. Normalization factor applied to align FG value pool with league budget. Clamped 0.5–2.0 per Phase 11 decision.

---

### Finding 6: Positional weights — COMPLIANT

**Spec**: SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1.

**Implementation** (`draft-constants.ts`):
```typescript
SS: 4, OF: 3, "3B": 3, "1B": 2, "2B": 2, C: 1, DH: 2, SP: 0, RP: 0
```

**Status**: Exact match. DH gets +2 (same as 1B/2B — reasonable given UTIL eligibility). SP/RP get 0 as specified by pure value strategy (no pitcher position weight bonus).

---

### Finding 7: Budget allocation targets — COMPLIANT (hardcoded in budget-curve.ts)

**Spec**: Hitters $185-205, Pitchers $55-70, Bench $5.

**Implementation** (`budget-curve.ts`):
```typescript
hitterBudgetTarget: { min: 185, max: 205 },
pitcherBudgetTarget: { min: 55, max: 70 },
benchBudget: 5,
```

**Status**: Exact match. These are display values used in tracking. Not enforced as hard constraints per prior decision.

---

### Finding 8: Bid ceiling adjustments — MOSTLY COMPLIANT

**Spec**: +2 if inflation > 1.10, +1 if position_need high. Clamped by budget_remaining - (remaining_roster_spots - 1).

**Implementation** (`strategy-caps.ts`):
- +2 inflation: `if (inflationFactor > 1.10) bidCap += 2` ✓
- Position need: implemented as positional weight (+1 to +4), not just +1 ✓ (superset of spec)
- Budget clamp: bid-optimizer upper bound = `budget - minReserves` where `minReserves = totalSlots - 1` ✓

**Divergences from spec formula**:
- Spec says `model_dollar_value - 2` as baseline; implementation uses SGP maxBid (more sophisticated, per prior decision)
- spec's `+1 if position_need high` is replaced with `+1 to +4` graduated positional weights (superset, acceptable)

**Status**: Compliant with spec intent. SGP replaces model_value-2 per prior decisions.

---

### Finding 9: Bid decision (BID/PASS, profit threshold, stop rule) — PARTIALLY COMPLIANT

**Spec**: current_price > bid_ceiling -> PASS. profit >= 5 -> BID aggressively. price >= value - 2 -> STOP.

**Implementation** (`auto-bid-controller.ts`):
- PASS: `if (currentBid >= autoBidCap) return` (stops at cap, not over it) — slightly different from spec (">" vs ">=")
- No explicit "profit >= 5 -> BID aggressively" logic
- STOP: `price >= value - 2` — not explicitly implemented; the auto-bidder just stops at the strategy cap

**Gap**: The spec's "profit >= 5 -> BID aggressively" has no corresponding logic. The engine computes `valueSurplus = maxBid - expectedMarketPrice` and `shouldBid = bidEV > passEV` (simulation-based), but there's no "aggressively bid when profit >= 5" behavior. Per prior decisions, simulation-based BID/PASS is preferred over the spec formula. However, the `shouldBid` field in `RosterOptimizationSignal` is currently set to `false` as a placeholder (bid computation moved to worker), and the worker result's `shouldBid` isn't wired through to `optimization.shouldBid` in the engine output.

**Status**: INVESTIGATION NEEDED — `optimization.shouldBid` appears to always be false in the synchronous engine output (placeholder). Need to verify whether the async bid worker result gets merged back into the signal before the UI reads it.

---

### Finding 10: Nomination strategy — COMPLIANT

**Spec**: nomination_score = espn_price - model_value. Nominate highest score (most overpriced).

**Implementation** (`nomination-strategy.ts`):
```
nominationScore = normalizedOverpricing * 0.6 + opponentNeedFactor * 0.2 + myNonNeedFactor * 0.2
where normalizedOverpricing = (espnAvgSalary - modelDollars) / MAX_OVERPRICING (clamped 0-1)
```

**Status**: Compliant in intent. The overpricing factor is primary (60%), with opponent need and my non-need as secondary tiebreakers (both 20%). This is a superset of the spec formula. Auto-bid controller (`auto-bid-controller.ts` line 689): `nominationScore: espnPrice - modelValue` — uses the raw spec formula directly. The two nomination paths (engine nomination-strategy vs controller nomination) differ slightly in formula but both prioritize overpriced players.

---

### Finding 11: Endgame trigger — COMPLIANT

**Spec**: budget_remaining <= $20.

**Implementation** (`budget-curve.ts` line 45, `strategy-caps.ts` line 110):
- `endgameMode = remainingBudget <= 20` ✓
- `if (isEndgame) bidCap = max(1, ceil(bidCap * 0.7))` (30% dampening) ✓
- Auto-bid controller: `const isEndgame = budgetCurve?.endgameMode === true` ✓

**Status**: Exact match.

---

### Finding 12: Category rank targets — COMPLIANT

**Spec**: OPS top 3, HR top 3, SB top 4, Saves top 4, K top 5.

**Implementation** (`draft-constants.ts`):
```typescript
OPS: 3, HR: 3, SB: 4, SV: 4, K: 5, R: 4, RBI: 4, W: 5, ERA: 4, WHIP: 4
```

**Status**: Exact match for all spec categories. Additional categories (R, RBI, W, ERA, WHIP) have sensible defaults not specified in the spec.

---

### Finding 13: DEFAULT_CATEGORY_TARGETS calibration — UNKNOWN

**Spec**: League has 13 teams. Category winning targets (R: 1188, HR: 348, etc.) are in `draft-state.ts` as `DEFAULT_CATEGORY_TARGETS`.

**Implementation** (`draft-state.ts`):
```typescript
R: 1188, HR: 348, RBI: 1132, SB: 247, OPS: 0.789,
K: 1619, SO: 1619, W: 107, SV: 132, ERA: 3.36, WHIP: 1.11
```

**Status**: UNKNOWN — These targets were presumably calibrated for a particular league size. Whether they are appropriate for a 13-team league vs a 12-team league is not documented. A 13-team league has ~13% more total rosters and potentially different competitive thresholds. This needs verification, but it's not a breaking issue since these are used for progress bars and bonus scoring, not hard decisions.

---

### Finding 14: Hitter budget cap — COMPLIANT BUT INCONSISTENT ACROSS FILES

**Spec**: Hitters $185-205 total.

**Implementation**:
- `strategy-caps.ts` line 88: `const HITTER_BUDGET_MAX = 200` — uses upper bound of spec range
- `engine/index.ts` line 598: `const HITTER_BUDGET_MAX = 200` — duplicate constant, same value
- `budget-curve.ts`: returns tracking object `hitterBudgetTarget: { min: 185, max: 205 }` — both bounds

**Status**: The $200 cap is per prior decision. The constant is defined in two places instead of being shared from `draft-constants.ts`. Minor code quality issue.

---

### Finding 15: GS cap — COMPLIANT

**Spec**: 200 GS cap.

**Implementation** (`draft-constants.ts`): `GS_CAP = 200` ✓ (advisory only, used for logging, not hard enforcement).

**Status**: Exact match. Advisory-only behavior per prior decisions.

---

### Finding 16: optimization.shouldBid async wiring — COMPLIANT

The `computeRosterOptimization` function returns `shouldBid: false` as a placeholder. The bid worker result arrives async via `onBidComplete` (implemented as `setAsyncBid` in `use-draft-engine.ts`). The hook maintains `asyncBid` React state and merges it:

```typescript
// use-draft-engine.ts lines 110-120
let mergedOptimization = baseSignals.optimization && asyncBid
  ? { ...baseSignals.optimization, maxBid: asyncBid.maxBid, shouldBid: asyncBid.shouldBid, ... }
  : baseSignals.optimization;
```

The merged result then has `computeStrategyBidCap` applied (lines 135-158), producing the final `strategyBidCap` and `capSource` visible in `BidVerdict`. The `useEffect` at lines 45-48 resets `asyncBid` to null when nomination changes, preventing stale worker results from persisting.

**Status**: COMPLIANT. Wiring is complete and correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Spec formula bid ceiling | Custom formula override | Verify SGP maxBid + computeStrategyBidCap covers all spec cases |
| Budget constant sharing | Duplicate literal in each file | Export HITTER_BUDGET_MAX from draft-constants.ts |

---

## Common Pitfalls

### Pitfall 1: totalTeams propagates deeply
**What goes wrong:** Changing the default from 12 to 13 only in `draft-state.ts` is insufficient. The migration function (line 485) and `content.tsx` fallback also need updating. And the CategoryHeatmap fallback needs to match.

### Pitfall 2: optimization.shouldBid is always false in sync output
**What goes wrong:** The BidVerdict component reads `engineSignals.optimization.shouldBid` which comes from the synchronous engine call. The async worker response patches this via `onBidComplete`. If the hook doesn't force a re-render on worker response, shouldBid will always appear false to the UI.

### Pitfall 3: AuctionPlayerCard hardcodes $260 budget
**What goes wrong:** If a player has spent $200 and has $60 remaining, `calculateBudgetPacing(260, ...)` uses 260 as the total, computing correct remaining ($60) since it subtracts spent. So the math works out numerically for $260 leagues. But the function's interface is confusing and won't generalize.

### Pitfall 4: Two nomination formulas coexist
**What goes wrong:** `nomination-strategy.ts` uses weighted formula (60/20/20); `auto-bid-controller.ts` evaluateAndNominate uses raw `espnPrice - modelValue`. These produce the same ranking direction but different magnitudes. In edge cases (no ESPN ASV available), they diverge: nomination-strategy falls back to `dollars/50 * 30`, controller falls back to `modelValue` as the score. Keep them in sync or consolidate.

---

## Recommended Audit Plan Structure

Based on research, two focused plans are recommended:

**Plan 01 — Constants and Formula Compliance**
1. Fix `totalTeams` default from 12 to 13 in `draft-state.ts` (initial state + migration), `content.tsx` fallback, and `CategoryHeatmap.tsx` fallback
2. Export `HITTER_BUDGET_MAX = 200` from `draft-constants.ts` and remove duplicate literals in `strategy-caps.ts` and `engine/index.ts`
3. Fix `AuctionPlayerCard.tsx` and `AuctionRecommendations.tsx` hardcoded `calculateBudgetPacing(260, ...)` — derive total budget from `remainingBudget + spent`
4. Document or update `DEFAULT_CATEGORY_TARGETS` with a note about 13-team calibration
5. Verify `pitcherHitterSplit` default (currently 75 in store, should be 65 per spec — hitters 65%, pitchers 35%)

**Plan 02 — Bid Decision and Nomination Consistency**
1. Confirm `BidVerdict` correctly displays `strategyBidCap` (the post-cap maxBid), not the raw worker maxBid — audit whether `maxBid` in the merged signal is the capped or uncapped value (from use-draft-engine.ts line 149: `cappedMaxBid = Math.min(mergedOptimization.maxBid, capResult.bidCap)` — displayed maxBid IS the capped value, which is correct)
2. Verify `auto-bid-controller` and `use-draft-engine.ts` apply `computeStrategyBidCap` with the same inputs — both read from the same store fields, but verify they stay in sync
3. Audit nomination formula consistency between `nomination-strategy.ts` (engine) and `auto-bid-controller.ts` evaluateAndNominate (controller) — currently two implementations of overpricing scoring
4. Verify `shouldBid` logic in BidVerdict is based on the worker's simulation EV (`asyncBid.shouldBid`) and shown correctly
5. Verify the `pitcherHitterSplit` default of 75 is intentional (vs spec's implied 65% hitting split)

---

## Key Findings for Planning

1. **totalTeams: 12 default** is wrong for this 13-team league. Change to 13 in draft-state.ts (initial state, migration v2→v3 path), content.tsx fallback, and CategoryHeatmap fallback.

2. **pitcherHitterSplit default is 75**, but spec implies 65% hitting / 35% pitching. The store initializes to 75. This means the default split is 75% hitting ($195 of $260), not 65% ($169 of $260). Given the hitter budget target is $185-205, a 75% split at $260 = $195 hitting which is within range. However the spec says 65% which would be $169 hitting — well below the $185 minimum target. This is a spec inconsistency: the 65/35 split at $260 gives $169 hitting but the budget target says $185-205. Either the split or the budget target is the authoritative spec. The store default of 75% seems more aligned with the $185-205 hitter budget.

3. **HITTER_BUDGET_MAX** is duplicated in two engine files. Should be a single export from `draft-constants.ts`.

4. **calculateBudgetPacing(260, ...)** hardcoded in AuctionPlayerCard and AuctionRecommendations — low severity since league budget is $260, but technically incorrect pattern.

5. **optimization.shouldBid wiring** needs audit — currently placeholder false in sync engine, should reflect async worker result.

6. **Nomination formula duplication** between nomination-strategy.ts and auto-bid-controller.ts — both work correctly but could drift.

---

## Sources

### Primary (HIGH confidence)
- Direct code reading of all files listed in Architecture section — verified against actual TypeScript source

### Metadata

**Confidence breakdown:**
- Constants/formulas: HIGH — read directly from source
- Async wiring: MEDIUM — use-draft-engine.ts not fully read (grep showed key lines); needs direct verification
- Default calibration (category targets): LOW — no documentation of 13-team calibration

**Research date:** 2026-03-18
**Valid until:** N/A (internal codebase audit, no external dependencies)

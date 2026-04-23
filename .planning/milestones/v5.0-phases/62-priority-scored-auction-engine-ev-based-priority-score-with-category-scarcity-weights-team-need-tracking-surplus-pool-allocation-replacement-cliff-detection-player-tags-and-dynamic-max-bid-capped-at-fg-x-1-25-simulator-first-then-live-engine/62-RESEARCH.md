# Phase 62: Priority-Scored Auction Engine - Research

**Researched:** 2026-03-20
**Domain:** TypeScript auction draft engine — EV-based priority scoring, category tracking, surplus allocation
**Confidence:** HIGH (all findings based on direct codebase inspection)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Replace SGP blend with EV-based priority scoring.** The new bid formula is: `priority_score = EV × category_weight × scarcity_weight × team_need_weight`. EV = FG_Dollars - ESPN_ASV. This replaces the current 60/40 SGP/ASV blend entirely.

2. **Max bid = inflated FG$ + EV buffer + category bonus, hard capped at FG$ × 1.25.** Never bid more than 125% of FanGraphs value. The EV buffer rewards market inefficiency; the category bonus rewards scarce-category contributors.

3. **Category weights: SB=1.5, SV=1.4, SP_efficiency=1.3, OPS=1.2, HR/RBI/R=1.0.** These reflect our league's scarcity profile. SB and SV are hardest to acquire; OPS is our rate stat.

4. **Scarcity weight updates dynamically:** `scarcity_weight = 1 + (1 - remaining_supply_ratio)` where remaining_supply_ratio = remaining pool stat total / initial pool stat total. As SB contributors get drafted, SB scarcity weight increases.

5. **Team need weight updates per pick:** `team_need_weight = 1 + max(0, (target - current_projection) / target)`. If we're behind pace on SB, SB contributors get bid up.

6. **Tag players for quick identification:**
   - `is_SB_anchor`: SB >= 20 projected
   - `is_OPS_anchor`: OPS >= .850
   - `is_SP_anchor`: high K rate AND ERA < league avg AND WHIP < league avg
   - `is_closer`: SV > 20 projected
   - `is_replaceable_bat`: SB < 5 AND OPS < .800

7. **Track surplus from bargain purchases.** When we win a player below FG$, the savings go into a surplus pool. Allocate 30-50% of surplus toward the next 2-3 highest priority targets.

8. **Detect when the next-best player at a position/category drops off sharply.** `dropoff = player_value - next_best_value`. If dropoff is large, add a cliff bonus to max bid — this player is worth reaching for.

9. **Track pace vs targets for each category.** `pace = current_total / target_total`. Below 85% → increase category weight. Above 105% → decrease weight. Below 80% mid-draft → force acquisition trigger.

10. **SP max $18, RP max $15.** These hard caps remain regardless of priority score.
11. **Hitter budget cap $200.** Total hitter spend cannot exceed $200.
12. **Per-player hitter cap at FG$ × 1.25.** Replaces the old flat $30 cap.
13. **Implement in the live extension engine only.** Do NOT touch the simulator. Write thorough unit and integration tests instead.
14. **FG$ from fangraphs-auction-hitters.json and fangraphs-auction-pitchers.json.** ESPN ASV from combined-draft-values.csv / espn-predraft-values.json (take max of ASV and pre-draft). These are already loaded by the extension.

### Claude's Discretion

- How to structure the priority score computation (new module vs extending existing bid-optimizer.ts)
- Whether to compute EV in bid-optimizer or in a pre-processing step
- How to persist category pace tracking across picks (store state vs recompute)
- Test structure — whether to extend existing bid-ceiling.test.ts or create new test files
- How many plans to split this into (suggest 3-4: core scoring, category tracking, surplus/cliffs, tests)

### Deferred Ideas (OUT OF SCOPE)

- Simulator rebuild (separate future phase)
- UI changes for category tracker/alerts (separate future phase)
- Opponent modeling (out of scope)
</user_constraints>

---

## Summary

Phase 62 replaces the current `computeMaxBid` SGP/ASV blend in `bid-optimizer.ts` with an EV-based priority scoring system. The current engine uses a 40/60 SGP-to-ASV blend with `computeMaxBid`, applies strategy caps via `computeStrategyBidCap` in `strategy-caps.ts`, and dispatches bid computation to a Web Worker (`bid-optimizer-worker.ts`). The new system introduces four new dimensions — EV, category weights, dynamic scarcity weights, and team need weights — that collectively replace the blend and drive a priority score.

The implementation splits cleanly into three concerns: (1) the priority score formula and max bid computation, which replace `computeMaxBid`; (2) dynamic category state tracking — scarcity weights, pace tracking, surplus pool, and cliff detection — which require new stateful computation feeding the formula; (3) player tagging, which is a preprocessing step on the pool. All of these live in `packages/extension/lib/engine/`. The bid result flows through an existing Web Worker pipeline and `computeStrategyBidCap` in `use-draft-engine.ts` still applies SP/RP hard caps on top.

The key architectural risk is that the EV-based formula (`FG_Dollars - ESPN_ASV`) can produce negative EV when ESPN ASV exceeds FG value. The formula must handle this gracefully — a negative EV player can still be tagged as a forced acquisition when pace triggers are active. Category pace state also needs careful design: it must survive across picks without requiring a full recompute of the entire engine, which argues for computing it in `computeDraftEngine` (where team totals are already aggregated) and passing it into the priority scorer.

**Primary recommendation:** Create a new `priority-scorer.ts` module for the core formula. Extend `bid-optimizer-worker.ts` to call it. Compute category state (scarcity, pace, surplus) in `computeDraftEngine` before the bid worker is dispatched, then pass it into the worker request. Keep `strategy-caps.ts` unchanged — SP/RP hard caps apply on top of the priority-scored max bid exactly as before.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (pure functions) | 5.x | All new modules | Engine is pure-function, no framework deps |
| Vitest | existing | Unit + integration tests | Already used in all engine test files |

No new dependencies needed. This is pure business logic in TypeScript.

---

## Architecture Patterns

### Current Bid Pipeline (to be replaced/extended)

```
computeDraftEngine (index.ts)
  └── buildSGPVectors (sgp.ts)             -- SGP computation
  └── runBidOptimizerInWorker              -- async dispatch
        └── bid-optimizer-worker.ts
              └── computeMaxBid            -- SGP/ASV blend → maxBid
              └── runMonteCarlo            -- shouldBid signal
  └── return DraftEngineSignals            -- with optimization.maxBid = 0 placeholder
        ↓ async
  └── onBidComplete callback
        ↓
  use-draft-engine.ts
  └── computeStrategyBidCap               -- SP/RP caps, hitter budget cap
  └── mergedOptimization.maxBid = cappedMaxBid
```

### New Bid Pipeline (Phase 62)

```
computeDraftEngine (index.ts)
  └── buildSGPVectors (sgp.ts)             -- unchanged
  └── computeCategoryState (new)           -- scarcity weights, pace, surplus, cliff
  └── runBidOptimizerInWorker              -- dispatch with categoryState added to request
        └── bid-optimizer-worker.ts
              └── computePriorityScore (new priority-scorer.ts)
                    └── EV = FG$ - ESPN_ASV
                    └── category_weight × scarcity_weight × team_need_weight
                    └── priority_score = EV × combined_weight
              └── computeEVMaxBid (replaces computeMaxBid)
                    └── inflated FG$ + EV buffer + category bonus
                    └── hard cap at FG$ × 1.25
              └── tagPlayer (new)          -- is_SB_anchor, is_closer, etc.
              └── runMonteCarlo            -- unchanged (shouldBid signal)
  └── onBidComplete callback
        ↓
  use-draft-engine.ts
  └── computeStrategyBidCap               -- SP/RP caps unchanged
```

### Pattern 1: Pure Function Modules
**What:** Each new module is a pure function with no side effects, no Zustand reads, no DOM access.
**When to use:** Always. The entire engine follows this pattern.
**Example:**
```typescript
// priority-scorer.ts
export function computePriorityScore(
  player: PoolPlayer,
  fgDollars: number,
  espnAsv: number,
  categoryState: CategoryState,
): PriorityScoreResult {
  const ev = fgDollars - espnAsv;
  // ... category_weight, scarcity_weight, team_need_weight
  return { priorityScore, evBuffer, categoryBonus, maxBid };
}
```

### Pattern 2: Category State as Computed Object
**What:** `CategoryState` is computed once per pick in `computeDraftEngine`, passed down to the bid worker.
**When to use:** Any time category tracking data is needed in bid computation.
**Example:**
```typescript
export interface CategoryState {
  scarcityWeights: Record<string, number>;  // statKey → current scarcity weight
  paceRatios: Record<string, number>;       // statKey → current_total / target_total
  surplusPool: number;                      // accumulated $ saved vs FG value
  cliffPlayers: Set<string>;               // normalizedNames with large dropoff
}
```

### Pattern 3: Worker Request Extension
**What:** `BidOptimizerWorkerRequest` in `bid-optimizer-worker.ts` gains a `categoryState` field.
**When to use:** New data needed in the worker is added to the structured-clone-safe request interface.
**Example:**
```typescript
export interface BidOptimizerWorkerRequest {
  // ... existing fields ...
  categoryState: SerializedCategoryState;  // Plain objects, not Maps
  fgDollars: number;                       // FG auction value for nominated player
}
```

### Pattern 4: Stateless Pool Initial Values
**What:** Scarcity weights need an "initial pool stat total" denominator. This should be computed on first call and passed in (not stored as module-level mutable state, to stay pure).
**When to use:** Any time a computation requires comparing current state to an initial baseline.

The cleanest approach: compute `initialPoolStats` once in `computeDraftEngine` using the full undrafted pool BEFORE the draft begins, then store it in module-level cache (same pattern as `cachedSGPVectors`). Invalidate when `leagueId` changes (new draft session).

### Anti-Patterns to Avoid

- **Mutating `PoolPlayer.stats` in place for tags:** Player tags should be a separate lookup map or enrichment wrapper, not mutations to the core `PoolPlayer` struct (which is shared and cached).
- **Recomputing initial pool stats on every pick:** Use module-level cache invalidated only on leagueId change (not pick count).
- **Applying FG × 1.25 cap before EV buffer:** The cap is a final ceiling, applied LAST — not before the category bonus is added.
- **Negative EV blocking all bids:** Negative EV (ASV > FG$) should result in priority_score = 0 at that component, not a negative max bid. Floor at 1 (minimum bid).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stat totals for pace tracking | Custom aggregation | Re-use `teamDraftedTotals` already computed in `computeDraftEngine` | Already aggregated for projected standings; no duplication needed |
| Category target values | New constants | `CATEGORY_RANK_TARGETS` in `draft-constants.ts` + `categoryTargets` from `DraftEngineInput` | Both sources exist and are already wired |
| Initial pool stat totals | Separate CSV pass | Build from `undraftedPlayers` pool before draft begins | All player stats are already in `PoolPlayer.stats` |

---

## Common Pitfalls

### Pitfall 1: EV Formula with Missing ESPN ASV
**What goes wrong:** Many players won't have an ESPN ASV (pre-draft only, or mid-draft with no DOM scrape). `EV = FG$ - undefined` produces NaN.
**Why it happens:** `espnAsvByName` and `espnDomAuctionValues` are both optional. Early in the draft, or for bench players, ASV may not exist.
**How to avoid:** Define a fallback: when ESPN ASV is missing, EV = 0 (treat player as fairly priced by market). The category weight and scarcity weight still apply on top, so valuable players still get bid up.
**Warning signs:** `priority_score = NaN` in test output.

### Pitfall 2: Scarcity Weight Exceeds Reasonable Range
**What goes wrong:** If 90% of SB contributors are drafted early, `scarcity_weight = 1 + (1 - 0.1) = 1.9`. Combined with `team_need_weight = 1 + 1.0 = 2.0` and `category_weight = 1.5`, the multiplier chain reaches `1.9 × 2.0 × 1.5 = 5.7×`. Applying this to EV and adding to FG$ could easily breach FG$ × 1.25.
**Why it happens:** Multiplier chains are unbounded without explicit clamping.
**How to avoid:** The hard cap `FG$ × 1.25` is the safety valve. But also clamp each weight individually: `scarcity_weight ∈ [1.0, 2.0]`, `team_need_weight ∈ [1.0, 2.0]`.
**Warning signs:** Max bid equals exactly `FG$ × 1.25` on almost every player.

### Pitfall 3: Pace Tracking for LOWER_BETTER Categories
**What goes wrong:** For ERA and WHIP, "below pace" means ERA is TOO HIGH (bad). The logic `pace < 85% → increase weight` applies to HIGHER_BETTER counting stats. For ERA/WHIP, being below pace (high ERA) means you need better pitchers, but the formula direction is inverted.
**Why it happens:** The decision says `pace = current_total / target_total` but doesn't specify how to handle rate stats.
**How to avoid:** For LOWER_BETTER categories, calculate `pace = target / current_total` (inverted). Below 85% pace still means "need improvement." Alternatively, skip ERA/WHIP in pace tracking (they respond to SP quality selection, not counting accumulation).
**Warning signs:** ERA/WHIP weight increases when you have GOOD pitching (low ERA), which is backwards.

### Pitfall 4: Surplus Pool Needs Cost Basis
**What goes wrong:** "Savings" requires knowing what we budgeted for the player. The spec says "when we win a player below FG$" — but FG$ can be negative (negative-value players have $0 floor in pool). Also, FG$ for a $3 player vs an $18 player creates asymmetric savings.
**Why it happens:** FG$ from auction calculator data is the cost basis. It's already on `PoolPlayer.dollars`.
**How to avoid:** Surplus = max(0, FG$ - actual_paid). Cap surplus contribution at 50% of the gap to avoid snowballing. Track surplus as a running total in `computeDraftEngine` by inspecting `input.myRoster` cost vs FG pool dollars.
**Warning signs:** Surplus pool grows unboundedly.

### Pitfall 5: Cliff Detection Needs a Pool Snapshot
**What goes wrong:** `dropoff = player_value - next_best_value` requires identifying the "next best" player at the same position/category. If you compute this on the SGP-sorted pool, it changes every pick (as players get drafted). Computing on FG$ is stable but doesn't reflect draft state.
**Why it happens:** Cliff detection is inherently snapshot-dependent.
**How to avoid:** Compute cliff bonus on the undrafted pool (same snapshot used for SGP). The next-best is the next undrafted player in the sorted category-specific ranking. Recompute once per pick (cached with the SGP cache key).
**Warning signs:** Cliff bonus is applied to already-drafted players.

### Pitfall 6: Worker Serialization of CategoryState
**What goes wrong:** `CategoryState` with `Set<string>` for cliff players cannot be structured-cloned as-is (Sets are cloneable in modern browsers, but the existing codebase serializes Maps to plain objects for safety — see `SerializedOpponentModel`).
**Why it happens:** Consistent pattern: the simulation worker uses plain objects everywhere.
**How to avoid:** Serialize `cliffPlayers` as `string[]` in the worker request, reconstruct to `Set<string>` inside the worker.

---

## Code Examples

### Current computeMaxBid Return Shape (what's being replaced)
```typescript
// Source: packages/extension/lib/engine/bid-optimizer.ts
return {
  maxBid,               // final bid (budget-clamped)
  sgpBreakeven,         // SGP dollar value (renamed field)
  rawBlendedValue,      // 40% SGP + 60% ASV blend
  valueSurplus,         // maxBid - expectedMarketPrice
  baselineValue: 0,     // deprecated
  withPlayerValue: 0,   // deprecated
  expectedMarketPrice,  // ESPN ASV or SGP-based estimate
};
```

New function should return the same shape for compatibility with `BidOptimizerWorkerResponse` and `use-draft-engine.ts` merger logic. Add new fields (`priorityScore`, `evBuffer`, `categoryBonus`) without removing old ones to avoid breaking downstream consumers.

### StrategyCapInput (what still runs AFTER the new bid)
```typescript
// Source: packages/extension/lib/use-draft-engine.ts line 144
const capResult = computeStrategyBidCap({
  rawMaxBid: mergedOptimization.maxBid,  // ← new EV-based maxBid feeds here
  isPitcher, isSP, positions,
  spCount, draftedSpPrices, draftedSpTierCaps,
  catcherSlotsRemaining, externalRank,
  isEndgame, inflationFactor,
  hitterSpent, pitcherSpent, remainingSlots,
});
```

The SP ($18 max), RP ($15 max), and hitter budget ($200) caps all apply AFTER the EV-based max bid. No changes to `strategy-caps.ts` are required.

### PoolPlayer.stats Keys Available for Tags
```typescript
// Hitters: HR, R, RBI, SB, AVG, OPS, AB, H, BB, HBP, SF, TB, PA
// Pitchers: W, SV, HLD, ERA, WHIP, K, SO, IP, HA, ER, BBA, QS, HRA

// Tag detection examples:
const isSBanchor = !player.isPitcher && (player.stats.SB ?? 0) >= 20;
const isOPSanchor = !player.isPitcher && (player.stats.OPS ?? 0) >= 0.850;
const isCloser = player.isPitcher && (player.stats.SV ?? 0) > 20;
const isReplaceableBat = !player.isPitcher &&
  (player.stats.SB ?? 0) < 5 && (player.stats.OPS ?? 0) < 0.800;
// is_SP_anchor: needs league avg K rate, ERA, WHIP — compute from pool median
```

### CATEGORY_RANK_TARGETS (existing, use directly)
```typescript
// Source: packages/extension/lib/engine/draft-constants.ts
export const CATEGORY_RANK_TARGETS: Record<string, number> = {
  OPS: 3, HR: 3, SB: 4, SV: 4, K: 5, R: 4, RBI: 4, W: 5, ERA: 4, WHIP: 4,
};
```

These are rank targets (finish top N). For pace tracking, you need absolute value targets. These should come from `input.categoryTargets` (already in `DraftEngineInput`) which is populated from projected standings. When `categoryTargets` is empty (early draft), fall back to a fixed multiplier or skip pace adjustment.

### teamDraftedTotals (existing, re-use for pace)
```typescript
// Already computed in computeDraftEngine (index.ts line ~933)
teamDraftedTotals = new Map<string, Record<string, number>>();
// Keys: teamId → { HR: N, R: N, RBI: N, SB: N, ... }
// Source: packages/extension/lib/engine/index.ts
```

For pace tracking, `teamDraftedTotals.get(input.myTeamId)` gives current category totals. No duplication needed.

### Existing Test File Patterns
```typescript
// Source: packages/extension/lib/engine/__tests__/bid-ceiling.test.ts
// Pattern: describe blocks per feature, makePlayer/makePool helpers, makeOpponentModel
import { describe, it, expect } from "vitest";
// All tests use pure function inputs — no mocking required
```

New test files should follow the same pattern: `describe("computePriorityScore — ...", () => { ... })`.

---

## Integration Points

### Where computeMaxBid Is Called

1. **`bid-optimizer-worker.ts` line 117** — the primary call site. This is where the replacement happens.
2. **`bid-optimizer-worker.ts` is called by `runBidOptimizerInWorker`** which is called from `computeDraftEngine` (index.ts line ~1273).
3. **`BidOptimizerWorkerResponse`** fields (`maxBid`, `rawBlendedValue`, `sgpBreakeven`, `expectedMarketPrice`, `valueSurplus`, `shouldBid`) are consumed by `use-draft-engine.ts` to build `mergedOptimization`.

### What Does NOT Need to Change

- `strategy-caps.ts` — SP/RP hard caps apply on top of EV-based maxBid unchanged.
- `use-draft-engine.ts` — the merge logic and `computeStrategyBidCap` call remain the same.
- `sgp.ts` — SGP vectors are still built and still feed `topTargets`. Phase 62 replaces the BID computation, not the target ranking.
- `simulation-worker.ts` — the forward simulation is explicitly out of scope.
- `BidOptimizerWorkerResponse` shape — keep same fields, add new ones (`priorityScore`, `evBuffer`, `categoryBonus`, `playerTags`).

### New Fields to Add to BidOptimizerWorkerRequest
```typescript
// Add to bid-optimizer-worker.ts BidOptimizerWorkerRequest:
fgDollars: number;                        // FG auction value for nominated player
categoryState: SerializedCategoryState;   // scarcityWeights, paceRatios, surplusPool, cliffSet
```

### New Fields to Add to BidOptimizerWorkerResponse
```typescript
// Add to BidOptimizerWorkerResponse:
priorityScore: number;     // combined EV × weight product
evBuffer: number;          // added to inflated FG$ for EV+ players
categoryBonus: number;     // added for scarce-category contributors
playerTags: string[];      // ["is_SB_anchor", "is_closer", etc.]
```

---

## Plan Structure Recommendation

Given the integration complexity, recommend **3 plans**:

**Plan 01 — EV-Based Priority Scorer (core formula)**
- Create `priority-scorer.ts` with `computePriorityScore`, `computeEVMaxBid`, `tagPlayer`
- Create `CategoryState` interface in `types.ts`
- Replace `computeMaxBid` call in `bid-optimizer-worker.ts`
- Add `categoryState` + `fgDollars` to worker request, add new fields to response
- Wire `CategoryState` computation in `computeDraftEngine` (reuse `teamDraftedTotals`)
- Tests: `priority-scorer.test.ts` covering EV formula, weight bounds, hard cap, negative EV

**Plan 02 — Dynamic Category State (scarcity, pace, surplus, cliff)**
- Create `category-state.ts` with `computeCategoryState` function
- Implements: initial pool stats cache, scarcity weight formula, pace tracking, surplus pool, cliff detection
- Wire into `computeDraftEngine` before bid worker dispatch
- Tests: `category-state.test.ts` covering weight dynamics, LOWER_BETTER inversion, surplus accumulation, cliff detection edge cases

**Plan 03 — Tests and Integration Validation**
- Integration test: full `computeDraftEngine` call verifies priority-scored maxBid flows through to `optimization.maxBid`
- Regression tests: existing bid-ceiling.test.ts + strategy-caps.test.ts must still pass
- Verification that SP/RP hard caps still apply correctly on top of EV-based bid

---

## Open Questions

1. **SP_efficiency category weight (1.3) — what stat keys does this apply to?**
   - What we know: the decision says "SP_efficiency=1.3" but our categories are W, K, ERA, WHIP. SP efficiency is not a single stat key.
   - What's unclear: Does this weight apply to ERA + WHIP together? Or to a combined SP quality proxy? Or to any player tagged `is_SP_anchor`?
   - Recommendation: Apply 1.3 weight to ERA and WHIP categories (both efficiency metrics). When computing category bonus for a player, use 1.3 for ERA and WHIP contributions.

2. **"inflated FG$" in max bid formula — which inflation factor?**
   - What we know: `inflationFactor` is already computed and passed to the bid worker. The formula says `max bid = inflated FG$ + EV buffer + category bonus`.
   - What's unclear: Is "inflated FG$" = `FG$ × inflationFactor`, or a different adjustment?
   - Recommendation: Use `FG$ × inflationFactor` as the base, then add EV buffer and category bonus, then apply hard cap at `FG$ × 1.25`. Note: the 1.25 cap is on raw FG$, not inflated.

3. **Surplus allocation "next 2-3 highest priority targets" — when exactly is surplus deployed?**
   - What we know: surplus is tracked from bargain wins. The decision says "allocate 30-50% toward next 2-3 highest priority targets."
   - What's unclear: Is surplus a boost to max bid for those players? Or a separate budget reserve tracked outside the main bid computation?
   - Recommendation: Implement as a bonus added to `evBuffer` when the nominated player is in the top-3 priority targets list. Surplus = min(surplusPool × 0.4, FG$ × 0.25 remaining headroom under cap).

4. **Force acquisition trigger at <80% pace — what does "force" mean in bid context?**
   - What we know: pace < 80% mid-draft triggers a "force acquisition" flag.
   - What's unclear: Does this override the FG$ × 1.25 hard cap? Or just set `shouldBid = true` regardless of EV?
   - Recommendation: Force acquisition means `shouldBid = true` and apply the full priority boost, but still respect the FG$ × 1.25 hard cap. The engine signals urgency without removing the bid ceiling.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all findings verified by reading source files

### Files Inspected
- `/packages/extension/lib/engine/bid-optimizer.ts` — current bid computation, will be replaced
- `/packages/extension/lib/engine/bid-optimizer-worker.ts` — worker protocol, will be extended
- `/packages/extension/lib/engine/strategy-caps.ts` — SP/RP caps, unchanged
- `/packages/extension/lib/engine/draft-constants.ts` — CATEGORY_RANK_TARGETS, SP tier caps, HITTER_BUDGET_MAX
- `/packages/extension/lib/engine/index.ts` — full engine orchestrator, teamDraftedTotals, worker dispatch
- `/packages/extension/lib/engine/sgp.ts` — SGP computation, will remain for topTargets ranking
- `/packages/extension/lib/engine/types.ts` — all interfaces, PoolPlayer, DraftEngineInput, RosterOptimizationSignal
- `/packages/extension/lib/engine/archetype.ts` — buildFgPlayerPool, PoolPlayer.stats keys
- `/packages/extension/lib/fangraphs-data.ts` — FG data interfaces, available stat fields
- `/packages/extension/lib/use-draft-engine.ts` — how bid results are merged, strategy caps applied
- `/packages/extension/lib/engine/__tests__/bid-ceiling.test.ts` — existing test patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — TypeScript + Vitest, no new deps needed
- Architecture: HIGH — based on direct codebase reading
- Pitfalls: HIGH — derived from actual code behavior (EV with missing ASV, multiplier chain, LOWER_BETTER inversion)
- Open questions: MEDIUM — design interpretation questions, not technical unknowns

**Research date:** 2026-03-20
**Valid until:** Stable for this phase duration (no external dependencies)

# Phase 64: Dynamic Budget Allocation — Research

**Researched:** 2026-03-22
**Domain:** Auction draft engine — budget surplus calculation, dynamic bid scaling, reserve policy
**Confidence:** HIGH (all findings from direct codebase inspection)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **We're ending drafts with unspent money.** The $3/slot reserve and FG$ × 1.25 cap are too conservative.
2. **After every pick, recalculate the ideal remaining team from the board.** Sum up the FG$ of the best available board player at each unfilled position. This is the "ideal remaining spend."
3. **If budget > ideal remaining spend, we have surplus.** Distribute that surplus across top remaining targets by bidding above FG$ × 1.25.
4. **Surplus boost: bid up to FG$ × (1 + surplus_ratio).** Where `surplus_ratio = (budget - ideal_spend) / ideal_spend`.
5. **Cap surplus boost at FG$ × 1.5.** Never pay more than 150% of model value.
6. **Wait for top guys.** Reserve surplus for top board targets at needed positions, not lower-priority players.
7. **Minimum $1 per remaining slot (not $3).** The $3 reserve was too conservative.
8. **Last 5 picks: spend everything.** No reserve. Distribute remaining budget across the final picks.

### Claude's Discretion

- How to implement the ideal team calculation (new function vs extending draft-board-engine)
- Whether to cache the ideal team or recompute each nomination
- How to handle the "wait for top guys" logic — which players to reserve for
- Whether this needs new tests or can extend existing ones
- Engine only — no simulator changes

### Deferred Ideas (OUT OF SCOPE)

- Opponent budget modeling (tracking what other teams can afford)
- Draft pace optimization (nominating strategically to force opponent spending)
</user_constraints>

---

## Summary

Phase 64 changes how remaining budget is allocated across the rest of the draft. Currently the engine uses a flat $3/slot reserve (in `strategy-caps.ts`) and a hard FG$ × 1.25 cap (in `priority-scorer.ts`'s `computeEVMaxBid`). These are too conservative — when board players are available cheaply, the engine under-bids on top targets because it's hoarding reserves that will never be needed.

The fix introduces an **ideal remaining spend** calculation: for each unfilled position, look up the best available board player's FG$ and sum them up. Compare that sum to actual remaining budget to get a **surplus ratio**. When surplus is positive, scale bids up proportionally, capped at FG$ × 1.5. When surplus is negative (budget tight), hold to FG$. Change the $3/slot reserve to $1/slot, and in the final 5 picks, spend everything.

The implementation lives entirely in the engine layer — `draft-board-engine.ts` (new `computeIdealRemainingSpend` function), `strategy-caps.ts` (update reserve from $3 to $1), and `use-draft-engine.ts` (pass surplus ratio into the board bid override). The FG$ × 1.25 hard cap in `priority-scorer.ts` also needs updating; `computeEVMaxBid` caps at `fgDollars * 1.25` but the new max should be dynamic based on surplus.

**Primary recommendation:** Add `computeIdealRemainingSpend` to `draft-board-engine.ts`, compute surplus ratio there, expose it on `DraftBoardState`, then use it to scale the board's `recommendedMaxBid` in `use-draft-engine.ts`. Update `strategy-caps.ts` to use $1/slot reserve and the new surplus-aware cap. Keep the existing cap pipeline in `strategy-caps.ts` intact for non-board players.

---

## Standard Stack

### Core
| File | Purpose | Role in Phase 64 |
|------|---------|-----------------|
| `packages/extension/lib/engine/draft-board-engine.ts` | Board state: ideal roster, available players, surplus tracking | Add `computeIdealRemainingSpend`, expose `surplusRatio`, update `recommendedMaxBid` formula |
| `packages/extension/lib/engine/strategy-caps.ts` | Bid cap pipeline: reserve, SP tier, hitter budget, endgame flush | Change `RESERVE_PER_SLOT = 3` to `1`; update last-5-picks endgame logic; remove FG$ × 1.25 target cap |
| `packages/extension/lib/use-draft-engine.ts` | React hook: wires board state into signals, computes final `maxBid` | Pass `surplusRatio` from board state into bid override; apply `FG$ × (1 + surplusRatio)` capped at × 1.5 |
| `packages/extension/lib/engine/priority-scorer.ts` | `computeEVMaxBid`: FG$ × 1.25 hard cap | Update cap from `fgDollars * 1.25` to accept a dynamic multiplier parameter |

### Supporting
| File | Purpose | When Relevant |
|------|---------|--------------|
| `packages/extension/lib/engine/draft-constants.ts` | `HITTER_BUDGET_MAX`, `SP_TIER_CAPS`, `RESERVE_PER_SLOT` equivalent | If reserve constant is extracted here, update it; otherwise update in-place in strategy-caps |
| `packages/extension/lib/__tests__/strategy-caps.test.ts` | Existing strategy-caps tests | Many tests encode `$3/slot` reserve math — need updating |
| `packages/extension/lib/engine/__tests__/priority-scorer.test.ts` | Existing priority-scorer tests | Tests that assert FG$ × 1.25 cap need updating |

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are in-place modifications:

```
packages/extension/lib/
├── engine/
│   ├── draft-board-engine.ts       # Add computeIdealRemainingSpend + surplusRatio to DraftBoardState
│   ├── strategy-caps.ts            # $1/slot reserve, last-5-pick endgame
│   └── priority-scorer.ts          # Dynamic cap multiplier for computeEVMaxBid
├── use-draft-engine.ts             # Apply surplusRatio to board bid override
└── engine/__tests__/
    └── draft-board-engine.test.ts  # NEW: thorough tests for ideal spend + surplus ratio
```

### Pattern 1: Ideal Remaining Spend Calculation

**What:** For each unfilled roster position group, find the best available board player (by FG$) and sum their values.

**When to use:** Called inside `computeDraftBoardState` after available/drafted player sets are built, using the existing `positionsNeeded` and `availablePlayers` arrays already computed there.

**Key insight from the code:** The engine already computes `positionsNeeded` (array of position strings) and `availablePlayers` (board players not yet drafted). The ideal spend is:

```typescript
// Inside computeDraftBoardState, after positionsNeeded is built:
function computeIdealRemainingSpend(
  positionsNeeded: string[],
  availablePlayers: BoardPlayer[],
): number {
  // For each needed position, find the best (highest FG$) available board player
  // that's eligible at that position. Each player can only be used once.
  const used = new Set<string>();
  let total = 0;

  // Sort positions by specificity (C before OF — catchers have fewer alternatives)
  const specificityOrder = ["C", "SS", "2B", "1B", "3B", "OF", "MI", "CI", "SP", "RP"];
  const orderedPositions = [...positionsNeeded].sort(
    (a, b) => specificityOrder.indexOf(a) - specificityOrder.indexOf(b)
  );

  for (const pos of orderedPositions) {
    const eligible = availablePlayers
      .filter(p => !used.has(p.normalizedName) && isEligible(p, pos))
      .sort((a, b) => b.fgDollars - a.fgDollars);
    if (eligible.length > 0) {
      used.add(eligible[0].normalizedName);
      total += eligible[0].fgDollars;
    }
    // If no board player available at this position, ignore it —
    // the engine will fall back to EV bidding for off-board fills
  }
  return total;
}
```

**NOTE:** The `isEligible` function is already defined (as a closure) inside `computeDraftBoardState`. It needs to be extracted to module scope so `computeIdealRemainingSpend` can call it.

### Pattern 2: Surplus Ratio and Bid Scaling

**What:** `surplusRatio = (budget - idealRemainingSpend) / idealRemainingSpend`. When positive, scale bids up. Cap at 0.5 (FG$ × 1.5 max).

**Where it's applied:** In `use-draft-engine.ts`'s board override block. The `recommendedMaxBid` in `draft-board-engine.ts` currently calculates bids using a fixed `FG$ × 1.25` multiplier for targets. This needs to scale with surplus ratio:

```typescript
// In computeDraftBoardState bid calculation for board targets:
const surplusRatio = idealRemainingSpend > 0
  ? Math.max(0, (remainingBudget - idealRemainingSpend) / idealRemainingSpend)
  : 0;
const surplusMultiplier = 1 + Math.min(0.5, surplusRatio); // cap at ×1.5
// ...
recommendedMaxBid = Math.round(boardPlayer.fgDollars * surplusMultiplier);
bidReason = `TARGET ×${surplusMultiplier.toFixed(2)} (surplus ${Math.round(surplusRatio * 100)}%)`;
```

**Expose on DraftBoardState:**

```typescript
export interface DraftBoardState {
  // ... existing fields ...
  idealRemainingSpend: number;   // sum of FG$ for best available player at each needed position
  surplusRatio: number;          // (budget - idealSpend) / idealSpend, 0 when no surplus
  surplusMultiplier: number;     // 1 + min(0.5, surplusRatio)
}
```

### Pattern 3: Reserve Change ($3 → $1)

**What:** In `strategy-caps.ts`, the budget reserve calculation uses `RESERVE_PER_SLOT = 3`. Change to `1`.

**Location:**

```typescript
// strategy-caps.ts line ~265:
const RESERVE_PER_SLOT = 3;  // CHANGE TO: const RESERVE_PER_SLOT = 1;
```

Also in `use-draft-engine.ts` at line ~233:

```typescript
const RESERVE_PER_SLOT = 3;  // CHANGE TO: const RESERVE_PER_SLOT = 1;
```

**Both places need updating.** These are independent copies of the same constant. Consider extracting to `draft-constants.ts` to avoid future drift.

### Pattern 4: Last-5-Picks Endgame (Spend Everything)

**What:** The existing `budget flush` logic in `strategy-caps.ts` (lines ~414-440) already handles spending in the final picks. It currently:
- Triggers when `totalSpent > 200` AND `slotsRemaining <= 5`
- For `slotsRemaining <= 2`: spends full excess
- For `slotsRemaining 3-5`: spends 50% of excess (capped at rawMaxBid)

**Decision 8 says:** Last 5 picks: no reserve, spend everything. The existing flush fires at `totalSpent > 200`, but that guard may not fire if, say, only $180 has been spent by the last 5 picks (possible with a conservative draft). Change the trigger to `slotsRemaining <= 5` (unconditional), and apply the "full excess" formula for all 5 final slots.

### Pattern 5: "Wait for Top Guys" Logic

**What:** If a high-priority board target (top-ranked player at a needed position, not yet nominated) is still available and we can afford them, don't blow surplus on lower-priority players.

**Implementation approach:** In the surplus boost calculation, before applying the multiplier to the current nominated player, check whether a higher-priority player at the same position group is still available:

```typescript
// Is there a better (higher FG$) target at this position still available?
const betterTargetAvailable = availablePlayers.some(p =>
  p.tier === "target" &&
  p.positions.some(pos => boardPlayer.positions.includes(pos)) &&
  p.fgDollars > boardPlayer.fgDollars
);

// If a better target exists and we can afford them, cap the current boost
// to avoid overspending — reserve surplus for the better player
if (betterTargetAvailable) {
  const bestTarget = availablePlayers
    .filter(p => p.tier === "target" && p.positions.some(pos => boardPlayer.positions.includes(pos)))
    .sort((a, b) => b.fgDollars - a.fgDollars)[0];
  const canAffordBest = remainingBudget - recommendedMaxBid >= bestTarget.fgDollars;
  if (!canAffordBest) {
    // Reduce bid — preserve budget for the top target
    recommendedMaxBid = Math.round(boardPlayer.fgDollars); // no surplus boost
    bidReason += ` — hold for ${bestTarget.name} ($${bestTarget.fgDollars})`;
  }
}
```

### Pattern 6: `computeEVMaxBid` Dynamic Cap

**What:** In `priority-scorer.ts`, `computeEVMaxBid` hard-codes `const cap = fgDollars * 1.25`. This is the non-board path. The board path (in `draft-board-engine.ts`) overrides this anyway in `use-draft-engine.ts`, so the FG$ × 1.25 cap in `computeEVMaxBid` mainly affects off-board players. Decision says to apply surplus boost to board targets — the `computeEVMaxBid` cap can stay at 1.25 for off-board players (no change needed there). The surplus multiplier only applies within the board override path.

**Conclusion:** `computeEVMaxBid` does NOT need to change. The board override in `use-draft-engine.ts` already bypasses the EV-based bid for board players.

### Anti-Patterns to Avoid

- **Duplicating the reserve constant:** `RESERVE_PER_SLOT = 3` appears in both `strategy-caps.ts` and `use-draft-engine.ts`. Changing one without the other means the sidebar display and auto-bid behavior diverge. Fix both, or extract to `draft-constants.ts`.
- **Computing ideal spend from all roster slots:** Only sum FG$ for unfilled positions where a board player is available. Don't include positions where no board player exists — those will be filled off-board for cheap.
- **Negative surplus ratio panicking:** When `idealRemainingSpend = 0` (late draft, no board players left), guard against division by zero. Surplus ratio = 0 when no board players remain.
- **Surplus boost on UTIL/BN-bound players:** Don't apply surplus multiplier when the player would go to UTIL or BN — the existing need dampening already handles those. Only boost dedicated/flex slot fills.
- **Breaking existing reserve tests:** Many tests in `strategy-caps.test.ts` were written with specific `$3/slot` math (e.g., the "reserve cap" assertions). These tests will fail after the change and must be updated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Position eligibility | Custom eligibility table | `isEligible()` already in `draft-board-engine.ts` | Already handles flex (MI/CI) and UTIL correctly |
| Slot counting | Re-derive from roster | `remainingRosterSlots` already computed in `computeDraftBoardState` | Complex logic already handles all edge cases |
| Player ordering | Custom sort | Native `.sort()` by `fgDollars` | Simple scalar sort |

**Key insight:** The hard work (eligibility, slot assignment, position tracking) is already in `computeDraftBoardState`. The ideal spend calculation is a thin layer on top of already-computed data.

---

## Common Pitfalls

### Pitfall 1: `isEligible` is a Closure

**What goes wrong:** `isEligible` is defined as a local function inside `computeDraftBoardState` (line ~260). If `computeIdealRemainingSpend` is a module-level function, it can't call `isEligible` unless it's lifted to module scope.

**How to avoid:** Extract `isEligible` to module scope before adding `computeIdealRemainingSpend`. `isEligible` only takes `(player: BoardPlayer, pos: string)` — no dependencies on the surrounding closure, safe to lift.

### Pitfall 2: OF Needs 4 Slots, Not 1

**What goes wrong:** `positionsNeeded` contains `"OF"` once, but we need 4 OF players. The ideal spend for OF should sum the FG$ of the top 4 available OF players (or however many OF slots remain unfilled).

**Root cause:** The `positionLimits` map in `computeDraftBoardState` has `OF: 4`. `positionsNeeded` will only include `"OF"` once even if all 4 slots are empty — it's a presence check, not a count.

**How to avoid:** In `computeIdealRemainingSpend`, use `positionLimits` to determine how many players are needed per position, not just presence in `positionsNeeded`. For SP/RP, the limits are 99 (unlimited) — cap these at the actual remaining P-slot count (e.g., 9 - drafted_pitchers).

### Pitfall 3: Double-Counting Multi-Eligible Players

**What goes wrong:** A 2B/SS player could satisfy either the 2B need or the SS need. Naively summing the best player at each position could count one player twice.

**How to avoid:** Use a `used` set (as shown in the code example above). Process positions in specificity order (rarest positions first — C, SS, 2B, 1B, 3B, OF) so the scarcest need gets the best eligible player.

### Pitfall 4: Surplus Ratio When `idealRemainingSpend = 0`

**What goes wrong:** Late in the draft, all board players may be drafted. `idealRemainingSpend = 0` causes division by zero in `surplusRatio = (budget - 0) / 0`.

**How to avoid:** Guard: `const surplusRatio = idealRemainingSpend > 0 ? ... : 0`.

### Pitfall 5: Tests Will Break on $3 → $1 Reserve Change

**What goes wrong:** `strategy-caps.test.ts` has numerous tests that explicitly assert reserve cap math with $3/slot. Changing `RESERVE_PER_SLOT` will cause cascading failures.

**Warning signs:** Test names containing "reserve cap", "slots reserved", arithmetic like `$3×N`.

**How to avoid:** Update all failing tests as part of the plan. These aren't bugs — they're expected failures from an intentional behavior change. Plan should include a test-update task alongside the implementation task.

### Pitfall 6: Board Override vs. Strategy Caps Execution Order

**What goes wrong:** In `use-draft-engine.ts`, the strategy caps block (lines ~136-198) runs BEFORE the board override block (lines ~202-300). The board override sets `maxBid` from `boardState.recommendedMaxBid`, discarding the strategy-cap result. This is correct behavior. But if the reserve cap in `strategy-caps` still uses $3/slot, it will cap the `mergedOptimization.maxBid` before the board override runs — the board override will then `Math.min(boardState.recommendedMaxBid, maxAffordable)` where `maxAffordable` also uses $3/slot.

**There are TWO reserve cap locations in `use-draft-engine.ts`:**
1. Inside `computeStrategyBidCap` call (via `strategy-caps.ts`)
2. The `maxAffordable` calculation at line ~233-236 (`RESERVE_PER_SLOT = 3`)

Both need to change to $1/slot.

---

## Code Examples

### Current reserve cap in `use-draft-engine.ts` (must change)

```typescript
// Line ~233-236 (use-draft-engine.ts):
const RESERVE_PER_SLOT = 3;
const slotsAfterThis = Math.max(0, slotsLeft - 1);
const reserveNeeded = slotsAfterThis * RESERVE_PER_SLOT;
const maxAffordable = Math.max(1, remainingBudget - reserveNeeded);
```

Change `RESERVE_PER_SLOT = 3` to `RESERVE_PER_SLOT = 1`.

### Current reserve cap in `strategy-caps.ts` (must change)

```typescript
// Lines ~264-272 (strategy-caps.ts):
const RESERVE_PER_SLOT = 3;
const slotsAfterThis = totalSlotsLeft - 1;
const reserveNeeded = slotsAfterThis * RESERVE_PER_SLOT;
const maxAffordable = Math.max(1, budgetLeft - reserveNeeded);
```

Change `RESERVE_PER_SLOT = 3` to `RESERVE_PER_SLOT = 1`.

### Current FG$ × 1.25 cap in `priority-scorer.ts` (NO CHANGE NEEDED)

```typescript
// Lines ~147-148 (priority-scorer.ts):
const cap = fgDollars * 1.25;
```

This only affects off-board EV bids. Board override in `use-draft-engine.ts` already supersedes this for board players. Leave unchanged.

### Current budget flush trigger in `strategy-caps.ts` (needs update)

```typescript
// Lines ~413-414 (strategy-caps.ts) — current condition:
const totalSpent = input.hitterSpent + input.pitcherSpent;
if (input.remainingSlots != null && totalSpent > 200) {
  const slotsRemaining = Object.values(input.remainingSlots).reduce((s, v) => s + v, 0);
  if (slotsRemaining > 0 && slotsRemaining <= 5) {
```

Decision 8: last 5 picks, spend everything regardless of `totalSpent`. Remove the `totalSpent > 200` guard:

```typescript
if (input.remainingSlots != null) {
  const slotsRemaining = Object.values(input.remainingSlots).reduce((s, v) => s + v, 0);
  if (slotsRemaining > 0 && slotsRemaining <= 5) {
    // ... existing flush logic ...
    // Apply "full excess" formula for all 5 slots (not 50% for 3-5)
```

---

## Open Questions

1. **How many OF slots to include in ideal spend?**
   - What we know: `positionLimits.OF = 4`, but `positionsNeeded` only flags "OF" once.
   - What's unclear: Should ideal spend include 4 × best-OF-FG$ minus already-drafted-OF? Or just 1 OF slot (the next one)?
   - Recommendation: Count remaining OF need precisely. Use `positionLimits[pos] - draftedAtPos` for each position. For OF with 2 already drafted, ideal spend covers 2 more OF slots (2nd and 3rd best available).

2. **Should surplus boost apply to REACHes?**
   - What we know: REACH multiplier is currently 1.15 (vs TARGET 1.25). Decisions mention distributing surplus across "top remaining targets."
   - What's unclear: CONTEXT.md says "top remaining targets" — does that include reaches?
   - Recommendation: Apply surplus boost to reaches too, but with a lower base (start from FG$ × 1.0, not 1.25). Or: apply it to both, the distinction is already encoded in `nominatedPlayerTier`.

3. **Where does the "top guys" threshold live?**
   - What we know: The "wait for top guys" logic needs to compare the current nominee's FG$ to the best remaining target at the same position.
   - What's unclear: Is "top target" defined by tier="target" only, or by absolute FG$ rank?
   - Recommendation: Use `tier === "target" && fgDollars > currentPlayer.fgDollars` as the check. This avoids needing a separate threshold constant.

---

## Sources

### Primary (HIGH confidence)

All findings from direct source code inspection:

- `/packages/extension/lib/engine/draft-board-engine.ts` — `computeDraftBoardState`, `DraftBoardState`, `BoardPlayer`, `positionsNeeded`, `cumulativeSurplus`, `recommendedMaxBid`
- `/packages/extension/lib/engine/strategy-caps.ts` — `RESERVE_PER_SLOT = 3`, `computeStrategyBidCap`, budget flush logic
- `/packages/extension/lib/use-draft-engine.ts` — `RESERVE_PER_SLOT = 3` (second copy), board override block, strategy-cap application order
- `/packages/extension/lib/engine/priority-scorer.ts` — `computeEVMaxBid`, `fgDollars * 1.25` cap
- `/packages/extension/lib/__tests__/strategy-caps.test.ts` — existing tests encoding $3/slot reserve math
- `/packages/extension/lib/engine/__tests__/budget-curve.test.ts` — test pattern reference
- `/packages/extension/vitest.config.ts` — `globals: true, environment: "node"` (Vitest, no DOM)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct code inspection, no external libraries involved
- Architecture: HIGH — change surface is well-defined; execution order in use-draft-engine verified line-by-line
- Pitfalls: HIGH — `isEligible` closure issue, dual reserve constant, OF multi-slot need all verified from source

**Research date:** 2026-03-22
**Valid until:** Stable — no fast-moving dependencies. Only invalid if the files listed above are refactored.

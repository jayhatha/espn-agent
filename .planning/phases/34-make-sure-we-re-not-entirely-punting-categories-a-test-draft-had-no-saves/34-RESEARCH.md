# Phase 34: Make Sure We're Not Entirely Punting Categories - Research

**Researched:** 2026-03-08
**Domain:** Draft engine category floor enforcement — SGP-based roster optimizer + ideal roster + auto-bid controller
**Confidence:** HIGH

## Summary

The test draft ended with zero saves because the engine has no category floor mechanism. The SGP-based optimizer (`roster-optimizer.ts`) sorts players by SGP/$ efficiency and greedily fills slots. Closers (RPs with saves) are legitimate pitchers occupying the same `P` or `RP` slots as starters, and they compete in SGP efficiency against starters. Since elite closers typically have lower raw SGP per dollar than elite starters (SV is only one category vs. starters contributing W + K + ERA + WHIP), the optimizer never chooses them. The P slot holds 9 players and gets filled entirely with SP-type pitchers.

There is no mechanism that enforces "you must have at least N players contributing to each active scoring category." The `weakCategories` boost in `computeRosterOptimization` only applies a 30% SGP multiplier for categories already detected as weak via `projectedStandings.myWeakCategories`, and projected standings requires 3+ teams with draft data — meaning it fires too late (after most of the damage is done) and only if the projected standings engine has enough data to identify weakness. The archetype engine detects punted categories but does not feed that signal into the ideal roster optimizer or auto-bid controller.

**Primary recommendation:** Add a category floor guard that detects "completely uncovered" categories (zero contribution from any drafted or optimizer-selected player) and enforces a minimum number of RP/closer slots be filled when SV/HLD are active scoring categories. This guard belongs in the optimizer itself (as a pre-pass reservation) or as a hard constraint on the `optimizeRoster` function, not as a soft post-hoc signal.

## Root Cause Analysis

### Why Saves Are Punted

The `optimizeRoster` greedy algorithm in `roster-optimizer.ts`:
1. Sorts by `SGP/$ efficiency` (descending)
2. Greedily fills `SLOT_PRIORITY` slots

A typical elite closer (say, Emanuel Clase) might project: 35 SV, 65 K, 3.00 ERA, 1.10 WHIP, 65 IP. That is valuable but narrow — he contributes to SV + K + ERA + WHIP.

A typical elite starter (e.g., Tarik Skubal) projects: 15 W, 220 K, 2.50 ERA, 1.00 WHIP, 190 IP. He dominates 4 categories with huge IP leverage.

When SGP normalizes per-std-dev gains vs. replacement level, the starter has a much larger raw SGP total because he contributes to more categories and has far more volume (IP, K). The closer's SGP is concentrated in SV which has fewer competitors for those raw numbers.

The `P` slot accepts both `SP` and `RP` positions (via `FLEX_ELIGIBILITY`). With 9 P slots and starters dominating efficiency, the optimizer fills all 9 with starters and never selects a closer. The dedicated `RP` slot in `SLOT_PRIORITY` could force at least 1 closer — **but the default `DEFAULT_ROSTER_SLOTS` has no dedicated `RP` slot**. It has `P: 9` as a flex pitcher slot.

```typescript
// engine/index.ts — DEFAULT_ROSTER_SLOTS
const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1,
  CI: 1, MI: 1, OF: 4, UTIL: 3,
  P: 9,   // ← All pitchers go here. No dedicated RP slot.
  BN: 3,
};
```

The `FLEX_ELIGIBILITY` for `P` slot is `["SP", "RP"]`, so closers are eligible, but the optimizer will always prefer higher-efficiency SP.

### The Weak Category Boost Does Not Prevent the Problem

The `weakCategoriesOpt` boost in `computeRosterOptimization` (and `adjustedSgpValuesOpt`) applies a 30% SGP multiplier to players who contribute to categories in `projectedStandings.myWeakCategories`. But:

1. `projectedStandings` requires `teamsAnalyzed >= 3` — early in the draft this is unavailable.
2. `myWeakCategories` is populated only when a team ranks in the "bottom 4" of an existing standing — if the user has ZERO saves, their SV rank is only visible once some picks have been made.
3. The boost is applied at 30% per weak category, capped at 2x — this is insufficient to overcome the structural SGP efficiency gap between closers and starters.

### The Archetype Engine Sees It But Can't Fix It

`computeBuildArchetype` computes `CategoryCeiling.isPunted` — correctly identifying when the projected full-team ceiling falls below 70% of the competitive target for a category. It also identifies `pivotPlayers` that could fix punted categories. However:

- `BuildArchetypeSignal` is **not used by the roster optimizer or ideal roster**
- It is display-only in the sidebar
- The auto-bid controller does not consult it when deciding whether to bid on a closer

## Standard Patterns for Category Floor Enforcement

### Pattern 1: Pre-Allocation (Reservation Pass)

Before running the greedy optimizer, reserve N slots for players who contribute to "at risk" categories. This is the cleanest approach:

```typescript
// Before greedy fill, identify categories with zero current contribution
// Reserve 1 RP slot if SV is an active category and myRoster has 0 SV players
const svContributors = myRoster.filter(p => (p.stats.SV ?? 0) > 0);
if (leagueCategories.some(c => c.stat_key === 'SV') && svContributors.length === 0) {
  // Reserve 1 RP slot specifically for a closer
  reservedSlots.push({ slot: 'P', positionFilter: 'RP' });
}
```

### Pattern 2: Category Coverage Constraint in Optimizer

Pass a `categoryMinimums` constraint to `optimizeRoster`: a map of `stat_key → minimum_player_count`. If SV is active, `{ SV: 1 }` means at least 1 player with SV > 0 must be selected.

### Pattern 3: SGP Category Weight Amplification

For categories where the current roster has zero coverage, apply a much stronger boost (e.g., 5x instead of 1.3x) to players who are the primary contributors to that category (RPs for SV). This is softer than a hard constraint.

### Pattern 4: Ideal Roster Post-Processing

After computing the ideal roster, check if any active scoring category has zero total coverage across all selected players. If so, swap the lowest-SGP pitcher for the best available closer that covers the missing category.

## Architecture Patterns

### Where to Add the Fix

The fix should be applied in `computeIdealRoster` (in `engine/index.ts`), which calls `optimizeRoster`. This is the function that drives both the ideal roster display AND the auto-bid nomination strategy.

The auto-bid controller uses `idealRoster.players` directly to nominate players (via `lastEngineSignals?.idealRoster?.players`). If the ideal roster includes a closer, the controller will nominate and bid on closers.

```
computeDraftEngine()
  ├── computeIdealRoster()              ← Fix goes here (pre-pass or post-processing)
  │     └── optimizeRoster()           ← Or add constraint param here
  └── auto-bid controller reads idealRoster.players for nomination
```

### Recommended Approach: Pre-Pass Category Coverage Check

Before calling `optimizeRoster`, compute which active scoring categories have zero contribution from already-drafted players. For each such category, identify the best available player in the pool who contributes to that category, and add them as a "floor pick" — reserving a slot for them explicitly by placing them in `lockedPlayers`.

This:
- Keeps `optimizeRoster` pure (no API change needed)
- Uses the existing `lockedPlayers` parameter in `optimizeRoster`
- Is deterministic and predictable
- Works from the first pick (no dependency on projected standings)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Category coverage detection | Custom stat-sum loop | Already exists: `CategoryCeiling.currentTotal` from `computeBuildArchetype`, or inline sum over `myRoster` stats |
| RP identification | Regex on position strings | Use existing `player.isPitcher && player.stats.SV > 0` — SV stat on pool player signals closer |
| Scoring category lookup | Hardcode `["SV", "HLD"]` | Use `input.leagueCategories.map(c => c.stat_key)` — league-configured |

## Common Pitfalls

### Pitfall 1: Hardcoding "SV" Instead of Using League Categories

**What goes wrong:** If the league doesn't use SV/HLD as categories, the fix forces a closer onto the roster anyway, wasting a slot.
**Why it happens:** Developer writes `if (leagueScoringIncludes("SV"))` using a hardcoded check.
**How to avoid:** Always check `input.leagueCategories.find(c => c.stat_key === 'SV')` — this is the authoritative list.
**Warning signs:** Test with a K-only pitching league and verify no closers are forced.

### Pitfall 2: Fighting the Budget Reserve

**What goes wrong:** Forcing a closer into `lockedPlayers` at their FG dollar value ($15-25 for elite closers) can violate the budget reserve, leaving only $1 for remaining slots.
**Why it happens:** `optimizeRoster` subtracts locked player costs from the budget before the $1/slot reserve calculation.
**How to avoid:** Use `input.remainingBudget - reserveForLockedPick` check before forcing a floor pick. If budget is too tight, skip the floor enforcement.
**Warning signs:** Unfilled slots > 0 after optimizer runs.

### Pitfall 3: Double-Counting — Closer Already in Roster

**What goes wrong:** If the user has already drafted a closer (e.g., early in the draft they bid on Clase), the floor enforcement fires again and tries to add another closer.
**Why it happens:** Floor check looks at `myRoster` but doesn't check their actual stats (DraftedPlayer doesn't carry projectedStats reliably).
**How to avoid:** Check both `myRoster` stats and the `allPlayers` pool. The FG projection lookup maps (`cachedPitcherProjMap`) already exist in `computeDraftEngine`. Look up each drafted pitcher and check if `SV > threshold` (e.g., > 5 projected saves).
**Warning signs:** Roster ends up with 2+ closers unnecessarily.

### Pitfall 4: Floor Enforcement With Only BN Slots Remaining

**What goes wrong:** Late in the draft, the only remaining pitcher slot might be `BN`. Forcing a closer into BN is fine, but if BN has no RP eligibility, `findBestSlot` returns null and the closer is dropped.
**Why it happens:** `FLEX_ELIGIBILITY.BN` includes `RP`, so this should work — but custom slot definitions from `input.rosterSlots` might not.
**How to avoid:** Verify the detected `rosterSlots` (from DOM) includes BN → RP eligibility before enforcing. Fall back gracefully if no eligible slot exists.

### Pitfall 5: Category Gap vs. Category Floor Confusion

**What goes wrong:** The existing `weakCategoriesOpt` boost addresses categories where the user is *below average* — not zero. A user with 5 saves who is below average does NOT need floor enforcement (they have coverage), but the category gap signal might still treat SV as "weak."
**Why it happens:** Conflating "weak category" (below average) with "punted category" (zero coverage).
**How to avoid:** Floor enforcement should only activate when `currentCategoryTotal === 0` for an active scoring category. Category gap boost (existing logic) handles below-average cases. These are independent mechanisms.

### Pitfall 6: The `allPlayersOpt` Slice (Top 200)

**What goes wrong:** The engine slices to top 200 by dollar value: `allPlayers.sort((a, b) => b.dollars - a.dollars).slice(0, 200)`. Elite closers (Clase, Hader, etc.) should be in the top 200 by dollar value, so this should be fine. But midrange closers ($8-15) might not be.
**Why it happens:** Top-200 filter is by FG projected dollar value, and many closers sit between $10-20, well within the top 200.
**How to avoid:** Confirm by checking FG auction data — elite closers are almost always in top 100. This pitfall primarily affects midrange backups.

## Code Examples

### Detecting Zero-Coverage Categories

```typescript
// Source: internal pattern — matches existing engine style
function getZeroCoverageCategories(
  myRoster: DraftedPlayer[],
  leagueCategories: Category[],
  pitcherProjMap: Map<string, FgPitcherProjection>,
): string[] {
  const zeroCoverage: string[] = [];

  for (const cat of leagueCategories) {
    if (cat.type !== 'COUNTING') continue;  // Only counting stats can be "zero"
    if (cat.direction !== 'HIGHER_BETTER') continue;  // Skip ERA/WHIP

    let total = 0;
    for (const player of myRoster) {
      const nName = normalizeName(player.playerName);
      const proj = pitcherProjMap.get(nName);
      if (proj && cat.stat_key in proj) {
        total += (proj as any)[cat.stat_key] ?? 0;
      }
      // Also check hitter proj for hitter categories
    }

    if (total === 0) {
      zeroCoverage.push(cat.stat_key);
    }
  }

  return zeroCoverage;
}
```

### Finding the Best Floor Pick for a Category

```typescript
// Source: internal pattern — matches existing engine style
function findBestFloorPick(
  statKey: string,
  availablePlayers: PoolPlayer[],
  maxCost: number,
): PoolPlayer | null {
  const candidates = availablePlayers
    .filter(p => (p.stats[statKey] ?? 0) > 0 && p.dollars <= maxCost)
    .sort((a, b) => (b.stats[statKey] ?? 0) - (a.stats[statKey] ?? 0));

  return candidates[0] ?? null;
}
```

### Injecting as lockedPlayers

```typescript
// Source: internal pattern — matches existing optimizeRoster signature
const floorLockedPlayers: { player: PoolPlayer; cost: number }[] = [];

const zeroCats = getZeroCoverageCategories(input.myRoster, input.leagueCategories, cachedPitcherProjMap);
for (const statKey of zeroCats) {
  const budgetForFloor = Math.max(1, input.remainingBudget - totalSlotsRemaining);
  const floorPick = findBestFloorPick(statKey, playersForOptimizer, budgetForFloor);
  if (floorPick) {
    floorLockedPlayers.push({ player: floorPick, cost: floorPick.dollars });
    // Remove from main pool to avoid double-selection
    playersForOptimizer = playersForOptimizer.filter(p => p.normalizedName !== floorPick.normalizedName);
  }
}

const result = optimizeRoster(
  playersForOptimizer,
  adjustedSgpValues,
  input.remainingBudget,
  remainingSlots,
  floorLockedPlayers,  // ← category floor picks guaranteed
);
```

### Auto-Bid Category Floor Boost

In `auto-bid-controller.ts`, the `evaluateAndBid` method should also check for zero-coverage categories when a closer is nominated. If SV is an active category and the user has zero saves, bump the bid cap significantly:

```typescript
// In evaluateAndBid(), after computing autoBidCap:
const mySVTotal = /* compute from myRoster projections */ 0;
const svCategoryActive = /* check leagueCategories */ true;
if (svCategoryActive && mySVTotal === 0 && isRP && espnAsv != null) {
  // This is a zero-coverage closer — treat as ideal target even if not in idealRoster
  autoBidCap = Math.ceil(espnAsv * 1.1);
  capSource = `ZERO-COVERAGE SV, ASV $${espnAsv} +10%`;
}
```

## State of the Art

| Old Approach | Current Approach | Issue |
|--------------|------------------|-------|
| Pure SGP efficiency greedy | SGP/$ greedy, no floors | Punts single-category specialists (closers) |
| weakCategories 30% boost | Fires too late, too weak | Doesn't prevent zero-coverage |
| archetype.isPunted detection | Display only | Not wired into optimizer or auto-bid |

**What needs to change:**

1. `computeIdealRoster` in `engine/index.ts`: Add pre-pass to detect zero-coverage active scoring categories → force-lock 1 player per zero-coverage category into `optimizeRoster`'s `lockedPlayers`.

2. Optionally, increase the `weakCategories` SGP boost from 30% to a stronger multiplier (e.g., 100% = 2x) for categories with <10% coverage (near-zero) to cause organic preference before hitting zero.

3. Optionally, add a "zero coverage" flag to auto-bid controller so it aggressively bids on players covering zero-coverage categories even if they're not in the ideal roster.

## Key Decisions for the Planner

### Decision 1: Where to enforce (MUST CHOOSE ONE)
- **Option A**: Pre-pass in `computeIdealRoster` using `lockedPlayers` (recommended — deterministic, clean)
- **Option B**: Post-processing swap in `computeIdealRoster` (remove lowest-SGP pitcher, add best closer)
- **Option C**: Add `categoryMinimums` parameter to `optimizeRoster` itself (requires changing the optimizer signature and logic)

**Recommendation: Option A** — it's least invasive, uses existing API, and is easiest to test.

### Decision 2: Budget constraint for floor picks
The floor pick should only be forced if there's sufficient budget. If the remaining budget per slot is already < $2 (cheap-player territory), skip floor enforcement for this pick cycle.

### Decision 3: Scope of coverage check
Should only apply to **COUNTING + HIGHER_BETTER** categories with zero total projected contribution from any drafted player. Do not apply to rate categories (ERA/WHIP) or to categories where myRoster already has some coverage.

### Decision 4: How many floor picks
Start with 1 player per zero-coverage category. Don't try to cover every category perfectly — just prevent complete punts.

### Decision 5: Auto-bid integration
The ideal roster fix will naturally propagate to auto-bid nominations (controller reads idealRoster.players). A separate auto-bid patch for closers is optional but low risk. The planner may choose to include it as a bonus task or separate task.

## Open Questions

1. **Does `input.rosterSlots` (from DOM detection) ever include a dedicated `RP` slot?**
   - What we know: `DEFAULT_ROSTER_SLOTS` has only `P: 9`, no dedicated `RP`. But live league detection may differ.
   - What's unclear: If some ESPN leagues have a dedicated RP slot, closers already get forced. Need to check actual ESPN league data.
   - Recommendation: The fix should work regardless — if RP is already a dedicated slot, the optimizer already handles it. Floor enforcement is additive.

2. **Do the FG auction pitchers include enough closers with SV > 0 in the top-200 pool?**
   - What we know: FG projects all MLB pitchers including elite closers. Top closers (Clase, Hader, Díaz, etc.) project 30-40 SV and have FG dollar values of $15-25.
   - What's unclear: Whether the top-200 dollar-value slice reliably includes 3-4 viable closers.
   - Recommendation: Verify by checking the JSON asset, but this is almost certainly fine.

3. **How does HLD (holds) relate to this — does the same problem apply?**
   - What we know: HLD is a separate stat, closer to setup men. If the league uses HLD, midrange RPs cover it.
   - What's unclear: Whether HLD suffers the same complete punt.
   - Recommendation: Apply the same floor logic to HLD if active as a category.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/extension/lib/engine/index.ts` — `computeDraftEngine`, `computeIdealRoster`, `DEFAULT_ROSTER_SLOTS`
- Direct code inspection: `packages/extension/lib/engine/roster-optimizer.ts` — `optimizeRoster`, `FLEX_ELIGIBILITY`
- Direct code inspection: `packages/extension/lib/engine/sgp.ts` — `buildSGPVectors`, `PITCHING_STAT_KEYS`
- Direct code inspection: `packages/extension/lib/engine/archetype.ts` — `computeBuildArchetype`, `CategoryCeiling.isPunted`
- Direct code inspection: `packages/extension/lib/auto-bid-controller.ts` — `evaluateAndBid`, nomination path

### Secondary (MEDIUM confidence)
- Fantasy baseball category strategy: SV-heavy closers have lower raw SGP vs. starters by design (confirmed by code inspection showing SGP is normalized per-category and starters contribute more categories at higher volume)

## Metadata

**Confidence breakdown:**
- Root cause identification: HIGH — direct code inspection confirms no RP dedicated slot, no floor constraint
- Standard Stack: HIGH — fix uses existing `lockedPlayers` API in `optimizeRoster`
- Architecture: HIGH — `computeIdealRoster` is the right place, confirmed by tracing auto-bid nomination path
- Pitfalls: HIGH — all identified from direct code inspection of budget math and slot assignment logic

**Research date:** 2026-03-08
**Valid until:** Stable — these are internal implementation details, not external dependencies

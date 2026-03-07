# Phase 29: Ideal Roster Optimizer - Research

**Researched:** 2026-03-06
**Domain:** TypeScript extension engine + React sidebar UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Anchor player classification**
The optimizer must classify output players by spend tier to show the user how many expensive vs cheap players their budget supports:
- **Anchor** (>$20 ASV/dollar): Elite cornerstone players the strategy revolves around
- **Core** ($5-20): Solid contributors filling key roster spots
- **Value** (<$5): Cheap fills rounding out the roster

The UI should show a summary like "2 anchors + 5 core + 11 value" so the user knows their budget shape.

**Use existing optimizeRoster() greedy knapsack**
The `roster-optimizer.ts` already does greedy SGP/$ efficiency fill with position-aware slot assignment. Phase 29 calls it with the current remaining budget/slots and displays the result — no new optimizer algorithm needed.

**Lock already-drafted players**
Pass `input.myRoster` as locked players to `optimizeRoster()` so the ideal roster shows what to do with REMAINING budget and slots, not a from-scratch build.

**External rank boost in optimizer scoring**
Apply `computeExternalRankBoost()` to SGP values before passing to the optimizer, consistent with how top targets and shopping list already use it. Expert-ranked players should be preferred in the ideal roster too.

**Show in sidebar as collapsible section**
Display as a collapsible `<details>` section in EngineInsights, collapsed by default. Shows the ideal roster grouped by position with player name, dollar value, and anchor/core/value tier tag.

**Recompute on pick count change only**
Cache the ideal roster keyed on `allPicks.length` — same invalidation pattern as SGP vectors. No need to recompute on nomination changes.

### Claude's Discretion

- Exact dollar thresholds for anchor/core/value tiers (suggested $20/$5 but can adjust)
- Whether to show total projected SGP for the ideal roster vs current roster
- Layout details within the collapsible section
- Whether anchor count summary appears in the `<summary>` line or inside the expanded content

### Deferred Ideas (OUT OF SCOPE)

- Multiple roster strategies (e.g., "balanced" vs "stars and scrubs") — just show the single greedy-optimal roster
- Category-aware optimization (tilting toward weak categories) — greedy SGP/$ is sufficient for v1
- Opponent-aware optimization (avoiding players opponents will outbid) — too complex for initial version
</user_constraints>

## Summary

Phase 29 adds an "Ideal Roster" display to the extension sidebar. The core algorithm already exists: `optimizeRoster()` in `packages/extension/lib/engine/roster-optimizer.ts` is a greedy knapsack optimizer with full position-aware slot assignment. The phase is entirely about wiring the existing optimizer into the engine output pipeline and rendering the result in EngineInsights.

The implementation has four parts: (1) a new `IdealRosterSignal` type added to `types.ts`, (2) a `computeIdealRoster()` function added to `index.ts` that calls `optimizeRoster()` with the current remaining budget/slots and myRoster as locked players, (3) `IdealRosterSignal` added to `DraftEngineSignals`, and (4) an `IdealRosterPanel` React component rendered inside `EngineInsights.tsx`.

The main subtlety is correctly building the SGP values to pass to `optimizeRoster()`. The engine already applies `computeExternalRankBoost()` multipliers when scoring top targets and the shopping list — the ideal roster must apply the same adjustment so ranked players are preferred. The existing `cachedSGPVectors.playerSGPs` are the raw SGP values; rank boosts must be applied as a separate scoring step before calling `optimizeRoster()`.

**Primary recommendation:** Add `IdealRosterSignal` to types, call `optimizeRoster()` inside a new `computeIdealRoster()` helper in `index.ts`, cache on `allPicks.length`, classify each rostered player by dollar spend tier, then render in `EngineInsights` as a `<details>` section collapsed by default.

## Standard Stack

### Core (already present — no new installs needed)

| File | Role | How Phase 29 Uses It |
|------|------|----------------------|
| `lib/engine/roster-optimizer.ts` | Greedy knapsack optimizer | Call `optimizeRoster()` with remaining budget/slots + locked players |
| `lib/engine/rank-boost.ts` | `computeExternalRankBoost()` | Apply to SGP values before passing to optimizer |
| `lib/engine/types.ts` | Central type definitions | Add `IdealRosterSignal`, extend `DraftEngineSignals` |
| `lib/engine/index.ts` | Engine orchestration | Add `computeIdealRoster()`, integrate into `computeDraftEngine()` |
| `components/EngineInsights.tsx` | Sidebar section container | Add `<IdealRosterPanel>` inside the section list |

### New file

| File | Purpose |
|------|---------|
| `components/IdealRosterPanel.tsx` | Self-contained React component for the ideal roster `<details>` section |

**Installation:** None — all dependencies already present.

## Architecture Patterns

### How the engine pipeline works

`computeDraftEngine()` in `index.ts` is the single entry point. It:
1. Builds `allPlayersOpt` (undrafted pool, capped at top 200 by dollar value)
2. Builds/caches `cachedSGPVectors` keyed on `allPicks.length`
3. Computes `remainingSlotsOpt` by subtracting `myRoster` player positions from `activeSlotsOpt`
4. Builds `opponentModelOpt`
5. Calls `computeRosterOptimization()` (bid engine, top targets, shopping list)
6. Calls forward simulation

Phase 29 adds a seventh step: call `computeIdealRoster()` using the same shared variables that steps 2-4 already computed.

### Cache pattern (same as SGP vectors)

```typescript
// In index.ts — module-level
let cachedIdealRoster: IdealRosterSignal | null = null;
let idealRosterCacheKey: number = -1; // allPicks.length at last computation

// Inside computeDraftEngine():
if (idealRosterCacheKey !== input.allPicks.length || cachedIdealRoster === null) {
  cachedIdealRoster = computeIdealRoster(/* args */);
  idealRosterCacheKey = input.allPicks.length;
}
```

This is identical to `cachedProjectedStandings` (line 88-89 in index.ts) and `cachedSGPVectors` (line 82-84).

### How locked players work in optimizeRoster()

From `roster-optimizer.ts` lines 138-154:
- Locked players are passed as `{ player: PoolPlayer; cost: number }[]`
- The optimizer subtracts their cost from budget and decrements their slots before the greedy phase
- They appear in the output `roster[]` array
- Their SGP is **not** added to `totalSGPValue` (tracked externally by the caller)

For Phase 29, `myRoster` (type `DraftedPlayer[]`) must be converted to `{ player: PoolPlayer; cost: number }[]`. Each `DraftedPlayer` needs to be matched to a `PoolPlayer` by normalized name.

### SGP adjustment for rank boost

The existing shopping list and top targets apply `computeExternalRankBoost()` per-player. The optimizer takes raw `sgpValues[]` — it divides by `player.dollars` to get efficiency. To apply rank boosts, build an adjusted SGP array:

```typescript
// Source: index.ts lines 381-383 (existing top-targets pattern)
const adjustedSgpValues = allPlayersOpt.map((player, i) => {
  const sgp = sgpValuesOpt[i] ?? 0;
  const extRank = nameToExternalRank.get(player.normalizedName);
  const rankBoost = computeExternalRankBoost(extRank);
  return sgp * rankBoost;
});
// Then pass adjustedSgpValues to optimizeRoster()
```

Note: `nameToExternalRank` is already built in `computeRosterOptimization()` (lines 247-252 in index.ts). It must be hoisted to `computeDraftEngine()` scope or recomputed in `computeIdealRoster()`.

### Tier classification

After calling `optimizeRoster()`, classify each non-locked player in `result.roster` by their FanGraphs dollar value:

```typescript
function classifyTier(dollars: number): "anchor" | "core" | "value" {
  if (dollars > 20) return "anchor";
  if (dollars >= 5) return "core";
  return "value";
}
```

The CONTEXT.md notes $20/$5 as suggested thresholds. Since `dollars` is the FanGraphs projected value (not the auction price paid), this reflects inherent player value — a legitimate basis for tier classification.

### IdealRosterSignal type

```typescript
export interface IdealRosterPlayer {
  name: string;
  positions: string[];
  dollars: number;           // FanGraphs projected value
  tier: "anchor" | "core" | "value";
  isLocked: boolean;         // true = already drafted (myRoster player)
  sgpValue: number;          // Raw SGP contribution
}

export interface IdealRosterSignal {
  players: IdealRosterPlayer[];
  totalSGPValue: number;
  budgetUsed: number;
  unfilledSlots: number;
  anchorCount: number;
  coreCount: number;
  valueCount: number;
  computeTimeMs: number;
}
```

### DraftEngineSignals extension

```typescript
// In types.ts — extend existing interface
export interface DraftEngineSignals {
  // ... existing fields ...
  idealRoster: IdealRosterSignal | null;  // null when leagueCategories empty or allPlayers empty
}
```

### UI pattern: collapsible `<details>` in EngineInsights

Existing sections follow a consistent pattern (see lines 19-133, 230-275 in EngineInsights.tsx):

```tsx
<details className="group">
  <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
    <span className="text-body-sm font-semibold text-content">Ideal Roster</span>
    <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">&#9662;</span>
  </summary>
  <div className="px-3 pb-3 pt-2 bg-surface">
    {/* content */}
  </div>
</details>
```

The `<summary>` line can include the tier count summary (e.g. "2 anchors + 5 core + 11 value") inline as a secondary text element — this gives the user a snapshot without expanding.

### Position grouping for display

The `optimizeRoster()` result is a flat `PoolPlayer[]`. For display, group by a display slot. The existing `SLOT_PRIORITY` order in roster-optimizer.ts (`C, SS, 2B, 3B, 1B, OF, CI, MI, UTIL, P, BN`) provides a natural display order. However, simple grouping by `player.positions[0]` is sufficient for v1 — the optimizer already ensures one player per slot.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Roster slot optimization | Custom knapsack | `optimizeRoster()` | Already handles $1 reserve per slot, position constraints, flex slots, CI/MI expansion |
| SGP computation | Re-derive from stats | `cachedSGPVectors.playerSGPs` | Already computed for the draft round, keyed on allPicks.length |
| Player pool construction | Re-fetch FG data | `allPlayersOpt` (already built in computeDraftEngine) | Already built, deduplicated, sorted |
| Remaining slot calculation | Re-count from myRoster | `remainingSlotsOpt` (already computed in computeDraftEngine) | Already computed by subtracting myRoster positions from activeSlotsOpt |
| External rank boost | Custom scoring | `computeExternalRankBoost()` from rank-boost.ts | Consistent with top targets and shopping list |

**Key insight:** All the hard state (player pool, SGP vectors, remaining slots, rank lookups) is already computed in `computeDraftEngine()` before the ideal roster step runs. Phase 29 is consuming existing outputs, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Passing raw SGP to the optimizer without rank boosts

**What goes wrong:** Unranked players (no external rank) get 0.7x penalty; top-ranked players get up to 1.6x boost in top targets and shopping list, but the ideal roster uses raw SGP and picks different players — inconsistent recommendations confuse the user.

**Why it happens:** `optimizeRoster()` receives an `sgpValues[]` array and sorts by `sgp / dollars`. If raw SGP is passed, the rank boost is not reflected.

**How to avoid:** Build `adjustedSgpValues[]` with `computeExternalRankBoost()` applied, same pattern as lines 381-383 in index.ts. Pass the adjusted array to `optimizeRoster()`, not the raw `cachedSGPVectors.playerSGPs`.

**Warning signs:** The ideal roster recommends a player not in the top targets or shopping list for the same position.

### Pitfall 2: Locked player matching fails silently

**What goes wrong:** `myRoster` contains `DraftedPlayer` objects matched by ESPN player ID. The FG pool uses normalized names. If the name match fails, locked players are excluded and the optimizer treats their slots as unfilled — overspending on players that are already drafted.

**Why it happens:** `DraftedPlayer.playerName` may not perfectly match the FG pool's `PoolPlayer.normalizedName`. The same name normalization issues that affect other engine steps apply here.

**How to avoid:** Use the same `normalizeName()` function from `archetype.ts` that the rest of the engine uses. If a `myRoster` player can't be matched to a `PoolPlayer`, still decrement the slot (to model the slot as filled) but skip the `player` reference in locked players. Log a debug warning for unmatched players.

**Warning signs:** `budgetUsed` in the result is less than `myRoster` spend; unfilled slots count is higher than expected.

### Pitfall 3: Budget double-counting from locked player cost

**What goes wrong:** `optimizeRoster()` subtracts locked player costs from budget internally. If the caller passes `budget = remainingBudget` (already net of myRoster spend) but also passes myRoster as locked players with their actual costs, the optimizer subtracts those costs again.

**How to avoid:** Pass `budget = input.remainingBudget` (already the remaining budget after myRoster spend as tracked by `useDraftStore`). Verify by checking that `result.budgetUsed - lockedCost ≈ remainingBudget - result.budgetUsed` makes sense.

**Warning signs:** The optimizer fills fewer remaining slots than expected; `result.budgetUsed` exceeds `input.remainingBudget + lockedTotalCost`.

Actually — re-reading the optimizer code: it takes `budget` as total budget and subtracts locked cost internally. So pass `budget = input.remainingBudget + lockedTotalCost` (the total budget including what locked players already spent), NOT just `remainingBudget`. Let the optimizer handle the subtraction.

**Corrected approach:**
```typescript
const lockedTotalCost = lockedPlayers.reduce((s, lp) => s + lp.cost, 0);
const totalBudgetForOptimizer = input.remainingBudget + lockedTotalCost;
optimizeRoster(players, adjustedSgpValues, totalBudgetForOptimizer, remainingSlots, lockedPlayers);
```

### Pitfall 4: Tier classification based on cost paid vs FG value

**What goes wrong:** Classifying by `player.dollars` (FG projected value) vs actual auction price paid (`lockedPlayer.cost`). The CONTEXT.md decision says "Anchor (>$20 ASV/dollar)" — this refers to FanGraphs auction value, not price paid. A player purchased at $35 who FanGraphs values at $15 is Core, not Anchor.

**How to avoid:** Always use `player.dollars` (the FanGraphs projected value) for tier classification, regardless of what was paid for locked players.

### Pitfall 5: allPicks.length cache skips first render

**What goes wrong:** `idealRosterCacheKey` initializes to -1. On first render, `allPicks.length` may be 0, so the cache check `0 !== -1` triggers computation — correct. But if `allPicks` is empty and `leagueCategories` is also empty, `computeIdealRoster()` should return null before calling `optimizeRoster()`. Guard against calling the optimizer with no categories (SGP vectors would be degenerate).

**How to avoid:** Add an early return in `computeIdealRoster()`: if `leagueCategories.length === 0 || allPlayers.length === 0` return null, same pattern as other engine functions.

## Code Examples

### computeIdealRoster function skeleton

```typescript
// Source: patterns from index.ts (computeRosterOptimization) and roster-optimizer.ts

function computeIdealRoster(
  allPlayers: PoolPlayer[],
  sgpValuesRaw: number[],
  input: DraftEngineInput,
  remainingSlots: Record<string, number>,
  nameToExternalRank: Map<string, number>,
): IdealRosterSignal | null {
  if (allPlayers.length === 0 || input.leagueCategories.length === 0) return null;

  const t0 = performance.now();

  // Step 1: Apply rank boost to SGP values (consistent with top targets + shopping list)
  const adjustedSgpValues = allPlayers.map((player, i) => {
    const sgp = sgpValuesRaw[i] ?? 0;
    const extRank = nameToExternalRank.get(player.normalizedName);
    return sgp * computeExternalRankBoost(extRank);
  });

  // Step 2: Build locked players from myRoster
  const lockedPlayers: { player: PoolPlayer; cost: number }[] = [];
  let lockedTotalCost = 0;
  for (const drafted of input.myRoster) {
    const norm = normalizeName(drafted.playerName);
    const poolPlayer = allPlayers.find(p => p.normalizedName === norm);
    const cost = drafted.cost ?? 0;
    lockedTotalCost += cost;
    if (poolPlayer) {
      lockedPlayers.push({ player: poolPlayer, cost });
    }
    // Even if no FG match, slots are already decremented via remainingSlots
  }

  // Step 3: Call the optimizer
  // Pass totalBudget = remainingBudget + lockedCost so the optimizer can subtract
  const totalBudget = input.remainingBudget + lockedTotalCost;
  const result = optimizeRoster(
    allPlayers,
    adjustedSgpValues,
    totalBudget,
    remainingSlots,  // Already net of myRoster (computed in computeDraftEngine)
    lockedPlayers,
  );

  // Step 4: Classify players by tier
  const lockedNames = new Set(lockedPlayers.map(lp => lp.player.normalizedName));
  const players: IdealRosterPlayer[] = result.roster.map(player => ({
    name: player.name,
    positions: player.positions,
    dollars: player.dollars,
    tier: classifyTier(player.dollars),
    isLocked: lockedNames.has(player.normalizedName),
    sgpValue: sgpValuesRaw[allPlayers.indexOf(player)] ?? 0,
  }));

  const anchorCount = players.filter(p => p.tier === "anchor").length;
  const coreCount = players.filter(p => p.tier === "core").length;
  const valueCount = players.filter(p => p.tier === "value").length;

  return {
    players,
    totalSGPValue: result.totalSGPValue,
    budgetUsed: result.budgetUsed,
    unfilledSlots: result.unfilledSlots,
    anchorCount,
    coreCount,
    valueCount,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

function classifyTier(dollars: number): "anchor" | "core" | "value" {
  if (dollars > 20) return "anchor";
  if (dollars >= 5) return "core";
  return "value";
}
```

### IdealRosterPanel component skeleton

```tsx
// Source: patterns from ShoppingList.tsx and EngineInsights.tsx

interface IdealRosterPanelProps {
  idealRoster: IdealRosterSignal | null;
}

const TIER_STYLES: Record<string, { label: string; classes: string }> = {
  anchor: { label: "anchor", classes: "bg-warning-light text-warning" },
  core: { label: "core", classes: "bg-info-light text-info" },
  value: { label: "value", classes: "bg-surface-tertiary text-content-secondary" },
};

export default function IdealRosterPanel({ idealRoster }: IdealRosterPanelProps) {
  if (!idealRoster || idealRoster.players.length === 0) return null;

  const { anchorCount, coreCount, valueCount } = idealRoster;
  const summaryText = [
    anchorCount > 0 ? `${anchorCount} anchor` : null,
    coreCount > 0 ? `${coreCount} core` : null,
    valueCount > 0 ? `${valueCount} value` : null,
  ].filter(Boolean).join(" + ");

  return (
    <details className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-content">Ideal Roster</span>
          {summaryText && (
            <span className="text-body-xs text-content-tertiary">{summaryText}</span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">&#9662;</span>
      </summary>
      <div className="px-3 pb-3 pt-2 bg-surface">
        <div className="space-y-1">
          {idealRoster.players.map((p, i) => {
            const tier = TIER_STYLES[p.tier];
            return (
              <div key={`${p.name}-${i}`} className="flex items-center justify-between text-body-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-body-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${tier.classes}`}>
                    {tier.label}
                  </span>
                  <span className={`truncate ${p.isLocked ? "text-content-secondary" : "text-content font-semibold"}`}>
                    {p.name}
                  </span>
                </div>
                <span className="shrink-0 text-content-secondary ml-2">${p.dollars}</span>
              </div>
            );
          })}
        </div>
        {idealRoster.unfilledSlots > 0 && (
          <div className="text-body-xs text-content-secondary mt-2">
            {idealRoster.unfilledSlots} slot{idealRoster.unfilledSlots !== 1 ? "s" : ""} unfilled
          </div>
        )}
      </div>
    </details>
  );
}
```

### Cache integration in computeDraftEngine

```typescript
// Module-level additions to index.ts
let cachedIdealRoster: IdealRosterSignal | null = null;
let idealRosterCacheKey: number = -1;

// Inside computeDraftEngine(), after the sgpCacheKey block (~line 658):
if (idealRosterCacheKey !== input.allPicks.length || cachedIdealRoster === null) {
  try {
    cachedIdealRoster = computeIdealRoster(
      allPlayersOpt,
      sgpValuesOpt,
      input,
      remainingSlotsOpt,
      nameToExternalRank,  // must be hoisted from computeRosterOptimization scope
    );
    idealRosterCacheKey = input.allPicks.length;
  } catch (e) {
    console.warn("[DraftEngine] Ideal roster failed:", e);
    cachedIdealRoster = null;
  }
}
```

### Hoisting nameToExternalRank

`nameToExternalRank` is currently built inside `computeRosterOptimization()` (index.ts lines 247-252). It must be hoisted to `computeDraftEngine()` scope so `computeIdealRoster()` can use it without rebuilding:

```typescript
// Hoist into computeDraftEngine(), after building allPlayersOpt:
const nameToExternalRank = new Map<string, number>();
for (const r of input.rankings) {
  if (r.externalRank != null) {
    nameToExternalRank.set(normalizeName(r.playerName), r.externalRank);
  }
}
// Then pass nameToExternalRank to both computeRosterOptimization() and computeIdealRoster()
// Remove the local build inside computeRosterOptimization()
```

### Test pattern for computeIdealRoster

```typescript
// Source: existing roster-optimizer.test.ts pattern

it("classifies players by FG dollar tier", () => {
  const players = [
    makePlayer("ElitePlayer", ["OF"], 35), // anchor
    makePlayer("SolidPlayer", ["1B"], 12), // core
    makePlayer("CheapPlayer", ["SS"], 3),  // value
  ];
  const result = computeIdealRoster(players, [5, 3, 1], mockInput, slots, new Map());
  expect(result!.anchorCount).toBe(1);
  expect(result!.coreCount).toBe(1);
  expect(result!.valueCount).toBe(1);
});

it("returns null when no league categories", () => {
  const result = computeIdealRoster(players, sgp, { ...input, leagueCategories: [] }, slots, rankMap);
  expect(result).toBeNull();
});

it("locked players appear with isLocked: true", () => {
  // Set up myRoster with a matched FG player
  const result = computeIdealRoster(players, sgp, inputWithMyRoster, remainingSlots, rankMap);
  const locked = result!.players.find(p => p.isLocked);
  expect(locked).toBeDefined();
});
```

## State of the Art

| Old Approach | Current Approach | Impact for Phase 29 |
|--------------|------------------|---------------------|
| Roster optimization only for bid calculation | Use optimizer output as "ideal roster" display | Phase 29 repurposes existing infrastructure |
| SGP vectors rebuilt per call | Cached on allPicks.length | Ideal roster benefits from same cache automatically |
| Top targets scored with rank boost | Shopping list scored with rank boost | Ideal roster must explicitly apply same boost |

## Open Questions

1. **Should locked players be shown in the ideal roster display?**
   - What we know: The optimizer includes them in `result.roster[]`; they fill positions already committed
   - What's unclear: Showing already-drafted players in the "ideal" view may confuse users vs. showing only what remains to draft
   - Recommendation: Show locked players with a visual distinction (dimmed, "locked" label) so the user sees the complete picture, not just future picks

2. **What happens when remainingSlots is empty (fully drafted)?**
   - What we know: `optimizeRoster()` returns empty roster when no slots remain
   - What's unclear: Whether to hide the section or show a "roster complete" state
   - Recommendation: Hide the section (return null from IdealRosterPanel) when `idealRoster.players.length === 0 && idealRoster.unfilledSlots === 0`

3. **nameToExternalRank hoisting refactor scope**
   - What we know: It's built inside `computeRosterOptimization()` which is a local function
   - What's unclear: Whether to refactor `computeRosterOptimization()` to accept it as a parameter, or rebuild it in `computeIdealRoster()`
   - Recommendation: Hoist to `computeDraftEngine()` scope (one extra Map build per invocation is cheap) and pass to both functions

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `packages/extension/lib/engine/roster-optimizer.ts` — verified `optimizeRoster()` API, locked player handling, budget reserve logic
- Direct code inspection: `packages/extension/lib/engine/index.ts` — verified cache patterns (lines 82-93), player pool construction (lines 617-635), remaining slot computation (lines 672-703), rank boost application (lines 381-383)
- Direct code inspection: `packages/extension/lib/engine/types.ts` — verified `RosterOptimizationResult`, `DraftEngineSignals`, `PoolPlayer` interfaces
- Direct code inspection: `packages/extension/lib/engine/rank-boost.ts` — verified `computeExternalRankBoost()` formula and constants
- Direct code inspection: `packages/extension/components/EngineInsights.tsx` — verified UI patterns for `<details>` sections, CSS class names
- Direct code inspection: `packages/extension/components/ShoppingList.tsx` — verified player row display pattern, tier badge pattern
- Direct code inspection: `packages/extension/lib/engine/shopping-list.ts` — verified how rank boost and position need boost are applied to adjusted SGP

### Secondary (MEDIUM confidence)

- `packages/extension/lib/__tests__/roster-optimizer.test.ts` — verified test patterns, confirmed locked player behavior from tests
- `packages/extension/lib/draft-state.ts` — confirmed `remainingBudget` semantics (decremented on each `updateRoster()` call)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all files inspected directly; no external dependencies needed
- Architecture: HIGH — cache pattern, locked player API, and budget semantics verified from source
- Pitfalls: HIGH — budget double-counting pitfall derived from reading actual `optimizeRoster()` implementation line-by-line
- UI patterns: HIGH — component structure cloned directly from existing EngineInsights sections

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable codebase, no external dependencies)

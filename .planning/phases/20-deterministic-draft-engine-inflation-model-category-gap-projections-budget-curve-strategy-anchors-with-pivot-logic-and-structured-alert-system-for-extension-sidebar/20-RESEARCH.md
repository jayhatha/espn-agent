# Phase 20: Deterministic Draft Engine - Research

**Researched:** 2026-03-04
**Domain:** Chrome Extension — client-side deterministic auction valuation engine, scarcity model, category projection, alert system
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Deterministic Core + AI Narrator**: All math/valuation is pure deterministic functions. AI narrator layer ONLY interprets structured signals, never computes math.
- **Non-Negotiable**: AI must never generate player values, compute projections, or rank players. Only interpret deterministic outputs.
- **Extension-first**: All deterministic engine code runs in the Chrome extension package (client-side). No new backend endpoints required for Phase 1.
- **Use existing rankings**: The extension already has `rankings` (from backend `/api/draft/espn` + PitcherList merge), `auctionValues`, and projected stats in the Zustand draft store.
- **Use existing DOM scraping**: `scrapeESPNAuctionTable()` provides live ESPN $ values, `detectMyTeam()` and `detectAllTeamBudgets()` provide team/budget data from pick train.
- **Use existing draft state**: `draftedPlayers`, `myRoster`, `remainingBudget`, `totalTeams`, `rosterSize` already tracked in draft-state.ts.
- **Inflation formula**: `inflation = remaining_budget / remaining_projected_value`
- **Alert triggers**: severity > 0.65, strategy state changes, tier break imminent, inflation > 15%
- **Performance**: < 300ms deterministic recompute, debounce rapid auction events

### Claude's Discretion
- How to structure the deterministic engine modules (single file vs multiple)
- Exact alert severity calculation formulas
- UI layout for new engine outputs in sidebar
- How to compute replacement level from available data
- Whether to use z-scores vs percentile for category projections
- Caching strategy for projections

### Deferred Ideas (OUT OF SCOPE)
- AI narrator integration (spec Phase 3)
- Championship odds Monte Carlo simulator (spec Phase 4)
- Strategy object / anchor-pivot logic (spec Phase 2) — defer unless time permits
- Backend draft state storage
- Multi-agent alert prioritization
</user_constraints>

---

## Summary

Phase 20 builds a deterministic auction intelligence engine that lives entirely in the Chrome extension. The existing codebase already has significant scaffolding: Zustand draft state tracking all picks, budgets, rosters, and rankings; `calculateBudgetPacing()` providing a basic pacing model; `computePositionScarcity()` providing basic alerts; and `calculateAuctionValueWithInflation()` providing a simple inflation factor. This phase upgrades each of those stubs into a full, signal-emitting model.

The core work is creating a new `lib/draft-engine.ts` module (or a small `lib/engine/` folder) that exports pure functions consuming the existing Zustand state and returning structured signal objects. Those signals feed existing and new React components in the sidebar. No new API calls or backend changes are needed — the engine reads from state that is already being populated by the content script.

The biggest design decisions are: (1) how to compute "remaining projected value" accurately for inflation, (2) how to express category gap as an actionable signal, and (3) how to compute a meaningful `max_bid_recommendation` that accounts for inflation-adjusted player values. The research below resolves each of these using the data already available in `DraftRanking.projectedStats` and `AuctionValue.dollarValue`.

**Primary recommendation:** Implement engine as `packages/extension/lib/engine/` containing four pure-function modules — `inflation.ts`, `scarcity.ts`, `category-gap.ts`, `budget-curve.ts` — all called from a single orchestrator `draft-engine.ts` that returns a `DraftEngineSignals` object consumed by a new `EngineAlerts` React component in the sidebar.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ^4 | Draft state store | Already used — `useDraftStore` has all needed state |
| React | ^18 | Sidebar UI | Already used — WXT content script renderer |
| TypeScript | ^5 | Type safety | Already used throughout extension |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@espn-fantasy/shared` | workspace | `StatComponents`, `DraftRanking`, `AuctionValue`, `Category`, formulas | Use for all type references and rate calc functions |

**No new packages needed.** All math is vanilla TypeScript. The shared package already exports `calculateCategorySGP`, `calculateFinalRate`, `calculateAuctionDollarValue`, `getReplacementLevel`, and `calculateVBD`.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/lib/engine/
├── inflation.ts          # Inflation model: ratio of remaining budgets to values
├── scarcity.ts           # Upgraded positional scarcity with tier_drop + scarcity_index
├── category-gap.ts       # Category projection engine: z-score gap vs league average
├── budget-curve.ts       # Upgraded budget model with spend curve + max_bid
└── index.ts              # Orchestrator: calls all four, returns DraftEngineSignals

packages/extension/components/
├── EngineAlerts.tsx       # New: renders DraftAlert[] from engine signals
└── AuctionBudgetTracker.tsx  # Existing: upgrade to use BudgetCurveSignal

packages/extension/lib/
└── draft-engine-types.ts  # Shared signal interfaces (or inline in index.ts)
```

Alternatively, a single `lib/draft-engine.ts` (one file) is simpler and easier to test. Use the folder only if the single file exceeds ~350 lines.

### Pattern 1: Pure Function Engine with Structured Signals

**What:** All engine functions are pure — no side effects, no Zustand reads inside engine functions. The orchestrator reads state once and passes it as arguments.

**When to use:** Always. This makes each function independently testable and keeps the 300ms budget measurable.

**Example — orchestrator call in a React hook:**
```typescript
// Source: pattern inferred from existing value-calculations.ts design
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";

export function useDraftEngineSignals(): DraftEngineSignals {
  const state = useDraftStore();

  return useMemo(() => {
    return computeDraftEngine({
      rankings: state.rankings,
      auctionValues: state.auctionValues,
      allPicks: state.allPicks,
      myRoster: state.myRoster,
      remainingBudget: state.remainingBudget,
      totalTeams: state.totalTeams,
      rosterSize: state.rosterSize,
      teamRosters: state.teamRosters,
      myTeamId: state.myTeamId,
    });
  }, [
    state.rankings,
    state.allPicks,
    state.myRoster,
    state.remainingBudget,
    state.totalTeams,
    state.teamRosters,
  ]);
}
```

### Pattern 2: Inflation Model — Correct Formula Implementation

**What the CONTEXT.md formula means:**
```
inflation = total_remaining_actual_budget / total_remaining_projected_value
```

Where:
- `total_remaining_actual_budget` = sum of all teams' remaining budgets (from `detectAllTeamBudgets()` or `totalTeams * initialBudget - sum_of_all_pick_costs`)
- `total_remaining_projected_value` = sum of `auctionValues[].dollarValue` for all undrafted players still in the pool (excluding min-bid players below a threshold)

The inflation ratio tells you how much the market is paying per dollar of projected value. If inflation = 1.10, players are going for 10% more than their projected value. The existing `calculateAuctionValueWithInflation()` uses a flawed approach (compares against 70% spend expectation). The new model uses live ratio.

**Inflation-adjusted bid for a player:**
```typescript
// inflation_adjusted_value = player.dollarValue * inflation_factor
// If inflation = 1.15, a $30 player is worth bidding up to ~$34.50
const adjustedValue = Math.round(player.dollarValue * inflationFactor);
```

**Edge cases from Phase 11 decisions:**
- Clamp inflation factor: `Math.max(0.5, Math.min(2.0, rawFactor))` — already established in Phase 11
- When fewer than 20% of players remain, inflation is unreliable — flag as LOW confidence

### Pattern 3: Scarcity Index — Upgrading from Basic Alerts

The existing `computePositionScarcity()` in `lib/position-scarcity.ts` already computes `topPlayersLeft` and `teamsNeeding`. The upgrade adds:

1. **Tier drop value** — gap between the best available player at a position and the next tier. Uses existing `DraftRanking.tier` field.
2. **Scarcity index** — normalized 0-1 score combining supply/demand ratio and tier drop.

```typescript
// Existing data available in DraftRanking:
// - tier: number (players grouped into value tiers, lower = better)
// - vbdScore: number

// Tier drop: VBD difference between top available and next-tier player
const topAvailable = eligibleUndrafted[0]?.vbdScore ?? 0;
const nextTierPlayer = eligibleUndrafted.find(p => p.tier > eligibleUndrafted[0]?.tier);
const tierDropValue = topAvailable - (nextTierPlayer?.vbdScore ?? 0);

// Scarcity index: demand/supply ratio normalized, weighted by tier drop
const demandSupplyRatio = teamsNeeding / Math.max(1, topPlayersLeft);
const scarcityIndex = Math.min(1.0, (demandSupplyRatio * 0.6) + (tierDropValue / 50 * 0.4));
```

### Pattern 4: Category Gap Engine — Z-Score vs Percentile Decision

**Recommendation: Use z-score** (already implemented in `calculateCategorySGP` in shared/formulas.ts). The shared package exports this exact function. Re-use it.

**For category gap of user's team:**
```typescript
// For each category:
// 1. Sum projected stats for all players on my roster
// 2. Compute what "average team" looks like at same draft stage (all teams / totalTeams)
// 3. gap_z = (myTeamTotal - leagueAvgTotal) / leagueStdDev
// 4. category_risk_score = inverse of gap_z for categories where gap_z < -0.5

// Counting categories: sum directly from projectedStats
// Rate categories: sum components, then apply formula (use calculateFinalRate from shared)
```

The league average for a category at any draft stage = total drafted stat / totalTeams. The user's team is compared against this.

### Pattern 5: Budget Curve Model — Spend Curve Addition

**What the "spend curve" means:** At each roster position (by round/pick), there's an optimal cumulative budget spent. Deviation from this curve = budget_pressure.

The existing `recommendedMaxBid = remainingBudget * 0.4` is a static rule. The upgrade:

```typescript
// Optimal spend curve: distribute budget proportionally to player value tiers
// Tier 1 players (top 20% by VBD) should absorb ~50% of budget
// Remaining budget should be distributed to remaining roster spots

// budget_pressure = actual_remaining / optimal_remaining
// > 1.0 = have more budget than optimal (can be aggressive)
// < 1.0 = behind on budget pace (conserve)

// max_bid_recommendation for current nominated player:
// = min(inflation_adjusted_value * 1.10, available_budget * 0.35)
// The 1.10 allows 10% overpay on high-value targets
// The 0.35 cap prevents putting >35% of remaining budget on one player
```

### Pattern 6: Alert System — Severity Scoring

**Alert structure:**
```typescript
export interface DraftAlert {
  id: string;           // unique, for React key + dedup
  type: "inflation" | "scarcity" | "category_gap" | "budget" | "tier_break";
  severity: number;     // 0.0-1.0
  title: string;
  detail: string;
  position?: string;    // For scarcity alerts
  category?: string;    // For category alerts
  timestamp: number;
}
```

**Severity formulas:**
- **Inflation alert**: severity = `Math.min(1.0, (inflationFactor - 1.0) / 0.5)` — reaches 1.0 when inflation is 50%+, triggers at 15% (severity 0.30) but only surfaces in UI when > 0.65
- **Scarcity alert**: severity = `scarcityIndex` (already 0-1 from pattern 3)
- **Category gap**: severity = `Math.min(1.0, Math.abs(gapZScore) / 2.0)` — reaches 1.0 at 2 std dev gap
- **Budget**: severity = `Math.abs(1.0 - budgetPressure)` clamped to 1.0 — deviation from optimal curve
- **Tier break**: severity = `Math.min(1.0, tierDropValue / 30.0)` — reaches 1.0 when drop is 30+ VBD points

**Surface threshold:** Only show alerts with `severity > 0.65` (per CONTEXT.md locked decision).

### Anti-Patterns to Avoid

- **Re-reading Zustand state inside engine functions**: Read state once at hook level, pass as arguments. Prevents stale closure bugs.
- **Computing inflation from a single team's budget**: Must aggregate all teams' remaining budgets. Single-team inflation is meaningless.
- **Averaging rate stats across players**: Use component math (HR + HR + ...) then compute rate from totals. The shared `combineComponents()` does this.
- **Running full dataset recompute on every Zustand update**: Wrap in `useMemo()` with selective dependencies. Only recompute when `allPicks`, `myRoster`, or `remainingBudget` change.
- **Triggering alerts for every severity value**: Apply the 0.65 threshold. Below that, signals exist in state but do not surface as visible alerts.
- **Placing engine logic inside React components**: Pure functions only in engine layer. Components call `useDraftEngineSignals()` hook.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SGP/z-score calculation | Custom z-score | `calculateCategorySGP()` from `@espn-fantasy/shared` | Already correct, handles edge cases |
| Rate stat totals | Manual AVG = H/AB per player | `calculateFinalRate()` + `combineComponents()` from shared | Rate stats require component summing, not averaging |
| VBD dollar conversion | Custom proportional math | `calculateAuctionDollarValue()` from shared | Accounts for minimum bid + spending pool correctly |
| Replacement level | Custom index lookup | `getReplacementLevel()` from shared | Already handles UTIL/IF/CI slot proration |
| Inflation adjustment | Re-implement from scratch | Build on top of `calculateAuctionValueWithInflation()` pattern — but fix the formula | Clamp logic from Phase 11 is already established |

**Key insight:** `packages/shared/src/formulas.ts` exports exactly the math needed. The engine is glue code that assembles existing formulas against live draft state data. This is not a math-heavy implementation phase — it's an integration phase.

---

## Common Pitfalls

### Pitfall 1: Inflation Denominator Is Empty or Near-Zero
**What goes wrong:** Late in the draft, almost all high-value players are gone. `remaining_projected_value` approaches zero, making inflation explode toward infinity.
**Why it happens:** The formula divides by remaining value, which shrinks as the draft progresses.
**How to avoid:** Exclude players with `dollarValue <= 1` (minimum bid players) from the denominator. Apply the existing Phase 11 clamp: `Math.max(0.5, Math.min(2.0, rawFactor))`. Additionally flag as LOW confidence when fewer than 20 valued players remain.
**Warning signs:** `inflationFactor` > 2.0 before clamping.

### Pitfall 2: Category Gap Comparing Apples to Oranges
**What goes wrong:** User's team has 8 players drafted (early draft stage) while the "league average" is computed from all 12 teams who may have picked different counts.
**Why it happens:** Teams pick in different orders and at different speeds in auction.
**How to avoid:** Normalize by roster count. For each category, divide team totals by `myRoster.length` and league total by `totalDraftedPlayers / totalTeams` to get per-player rates before comparing.

### Pitfall 3: Scarcity Tier Drop Requires Sorted Rankings
**What goes wrong:** If `rankings` array is not sorted by VBD descending, the "top available" player is wrong and tier drop is meaningless.
**Why it happens:** Rankings may arrive unsorted from the API, or the sort order may change with user overrides.
**How to avoid:** Sort by `vbdScore` descending inside the scarcity function before picking `eligibleUndrafted[0]`. This is consistent with the comment in `value-calculations.ts`: "rankings are already sorted by VBD descending (from backend)" — but don't rely on that assumption in the engine.

### Pitfall 4: Max Bid > Remaining Budget
**What goes wrong:** `max_bid_recommendation` exceeds `remainingBudget`, or leaves fewer than `(remainingRosterSpots - 1)` dollars for all remaining picks.
**Why it happens:** Math ignores the constraint that every remaining roster spot needs $1 minimum.
**How to avoid:**
```typescript
const minReserve = remainingRosterSpots - 1; // $1 per remaining spot
const maxBidCap = remainingBudget - minReserve;
const maxBid = Math.min(inflationAdjustedValue * 1.1, maxBidCap, remainingBudget * 0.35);
```

### Pitfall 5: Alert Spam from Rapid Auction Events
**What goes wrong:** ESPN DOM fires multiple mutation events per player nomination, triggering dozens of recomputes and showing flashing alerts.
**Why it happens:** `observeCurrentAuctionPlayer` already debounces at 200ms but Zustand state updates can still trigger many re-renders.
**How to avoid:** The `useMemo` dependency list in `useDraftEngineSignals` should NOT include `currentAuctionPlayer` — that changes every 200ms. Only include state that changes per-pick (allPicks, myRoster, remainingBudget). The engine recomputes per-pick, not per-bid-update.

### Pitfall 6: Zustand Map Serialization — teamRosters
**What goes wrong:** `teamRosters` is a `Map<string, {...}>` in Zustand. Using it in `useMemo` dependencies causes stale reference issues because `Map` identity changes even if content is same.
**Why it happens:** Zustand store partially handles this in `partialize` (serializes to array), but in-memory it's a real Map.
**How to avoid:** Either (a) use `teamRosters.size` as the dependency, or (b) convert to a stable string key inside the hook before depending on it. The existing code in `value-calculations.ts` already reads `teamRosters` in a function called at effect time — follow that same pattern.

---

## Code Examples

### Inflation Model (Pure Function)
```typescript
// Source: derived from existing calculateAuctionValueWithInflation pattern + CONTEXT.md formula

export interface InflationSignal {
  inflationFactor: number;    // Clamped 0.5-2.0
  rawInflationFactor: number; // Unclamped (for debugging)
  totalRemainingBudget: number;
  totalRemainingValue: number;
  confidence: "high" | "low"; // Low when < 20 valued players remain
  percentOverMarket: number;  // (inflationFactor - 1) * 100
}

export function computeInflation(
  allPicks: DraftPick[],
  auctionValues: AuctionValue[],
  totalTeams: number,
  initialBudget: number,
): InflationSignal {
  // Remaining players: not yet drafted
  const draftedIds = new Set(allPicks.map(p => p.playerId));
  const remainingPlayers = auctionValues.filter(
    av => !draftedIds.has(av.playerId) && av.dollarValue > 1
  );

  const totalRemainingValue = remainingPlayers.reduce(
    (sum, av) => sum + av.dollarValue, 0
  );

  // Total actual remaining budget (all teams)
  const totalSpent = allPicks.reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const totalInitialBudget = initialBudget * totalTeams;
  const totalRemainingBudget = Math.max(0, totalInitialBudget - totalSpent);

  const rawFactor = totalRemainingValue > 0
    ? totalRemainingBudget / totalRemainingValue
    : 1.0;

  const inflationFactor = Math.max(0.5, Math.min(2.0, rawFactor));
  const confidence = remainingPlayers.length >= 20 ? "high" : "low";

  return {
    inflationFactor,
    rawInflationFactor: rawFactor,
    totalRemainingBudget,
    totalRemainingValue,
    confidence,
    percentOverMarket: Math.round((inflationFactor - 1) * 100),
  };
}
```

### Category Gap Engine (Pure Function)
```typescript
// Source: pattern using calculateCategorySGP from @espn-fantasy/shared

export interface CategoryGapSignal {
  category: string;
  myTeamTotal: number;
  leagueAvgTotal: number;
  gapZScore: number;           // Negative = below average
  category_risk_score: number; // 0-1, higher = more at risk
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export function computeCategoryGaps(
  myRoster: DraftedPlayer[],
  teamRosters: Map<string, {...}>,
  rankings: DraftRanking[],
  categories: Category[],
): CategoryGapSignal[] {
  const rankingsMap = new Map(rankings.map(r => [r.playerId, r]));

  // For each counting category, sum projected stats
  return categories
    .filter(cat => cat.type === "COUNTING")
    .map(cat => {
      const statKey = cat.stat_key;

      // My team's projected total for this category
      const myTotal = myRoster.reduce((sum, player) => {
        const ranking = rankingsMap.get(player.playerId);
        return sum + (Number(ranking?.projectedStats?.[statKey]) || 0);
      }, 0);

      // All teams' totals — use teamRosters
      const allTeamTotals: number[] = [];
      for (const [_, roster] of teamRosters) {
        const teamTotal = roster.playerIds.reduce((sum, pid) => {
          const ranking = rankingsMap.get(pid);
          return sum + (Number(ranking?.projectedStats?.[statKey]) || 0);
        }, 0);
        allTeamTotals.push(teamTotal);
      }

      const gapZScore = allTeamTotals.length > 1
        ? calculateCategorySGP(myTotal, allTeamTotals)
        : 0;

      // For LOWER_BETTER (ERA, WHIP), invert sign for risk scoring
      const adjustedZ = cat.direction === "LOWER_BETTER" ? -gapZScore : gapZScore;
      const category_risk_score = Math.min(1.0, Math.max(0, -adjustedZ / 2.0 + 0.5));

      return {
        category: cat.stat_key,
        myTeamTotal: myTotal,
        leagueAvgTotal: allTeamTotals.reduce((a, b) => a + b, 0) / Math.max(1, allTeamTotals.length),
        gapZScore,
        category_risk_score,
        direction: cat.direction,
      };
    });
}
```

### Budget Curve Model (Pure Function)
```typescript
// Source: upgrade of calculateBudgetPacing() in value-calculations.ts

export interface BudgetCurveSignal {
  remainingBudget: number;
  remainingRosterSpots: number;
  averageRemainingPerPlayer: number;
  budget_pressure: number;         // actual_remaining / optimal_remaining
  optimal_remaining_spend: number; // What you should have left at this stage
  max_bid_recommendation: number;  // For current nomination
  pacingStatus: "ahead" | "on-track" | "behind";
  inflationAdjustedRecommendedBid: number; // for currentAuctionPlayer
}

export function computeBudgetCurve(
  remainingBudget: number,
  remainingRosterSpots: number,
  totalBudget: number,
  totalRosterSize: number,
  inflationFactor: number,
  currentPlayerDollarValue: number, // from auctionValues for nominated player
): BudgetCurveSignal {
  const minReserve = Math.max(0, remainingRosterSpots - 1);
  const usableBudget = Math.max(0, remainingBudget - minReserve);

  const rosterProgress = 1 - (remainingRosterSpots / totalRosterSize);
  const expectedSpentFraction = rosterProgress * 0.9; // 90% spent at roster full
  const expectedRemainingFraction = 1 - expectedSpentFraction;
  const optimal_remaining_spend = totalBudget * expectedRemainingFraction;

  const budget_pressure = optimal_remaining_spend > 0
    ? remainingBudget / optimal_remaining_spend
    : 1.0;

  let pacingStatus: "ahead" | "on-track" | "behind";
  if (budget_pressure > 1.05) pacingStatus = "ahead";
  else if (budget_pressure < 0.95) pacingStatus = "behind";
  else pacingStatus = "on-track";

  const inflationAdjustedValue = Math.round(currentPlayerDollarValue * inflationFactor);
  const maxBidFromBudget = Math.floor(usableBudget * 0.35);
  const maxBidFromValue = Math.round(inflationAdjustedValue * 1.10);
  const max_bid_recommendation = Math.min(maxBidFromValue, maxBidFromBudget, usableBudget);

  return {
    remainingBudget,
    remainingRosterSpots,
    averageRemainingPerPlayer: remainingRosterSpots > 0 ? usableBudget / remainingRosterSpots : 0,
    budget_pressure,
    optimal_remaining_spend,
    max_bid_recommendation: Math.max(1, max_bid_recommendation),
    pacingStatus,
    inflationAdjustedRecommendedBid: Math.max(1, Math.min(inflationAdjustedValue, usableBudget)),
  };
}
```

### Master Orchestrator
```typescript
// Source: new file — assembles all four signals
export interface DraftEngineSignals {
  inflation: InflationSignal;
  scarcity: EnhancedPositionScarcitySignal[];
  categoryGaps: CategoryGapSignal[];
  budgetCurve: BudgetCurveSignal;
  alerts: DraftAlert[];
  computedAt: number; // performance.now() for 300ms budget check
}

export function computeDraftEngine(input: DraftEngineInput): DraftEngineSignals {
  const t0 = performance.now();

  const inflation = computeInflation(...);
  const scarcity = computeEnhancedScarcity(...);
  const categoryGaps = computeCategoryGaps(...);

  const currentPlayer = /* look up nominated player in auctionValues */;
  const budgetCurve = computeBudgetCurve(
    input.remainingBudget,
    remainingRosterSpots,
    initialBudget,
    input.rosterSize,
    inflation.inflationFactor,
    currentPlayer?.dollarValue ?? 0,
  );

  const alerts = generateAlerts(inflation, scarcity, categoryGaps, budgetCurve);

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    console.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms — exceeds 300ms budget`);
  }

  return { inflation, scarcity, categoryGaps, budgetCurve, alerts, computedAt: Date.now() };
}
```

### Alert Generation
```typescript
export function generateAlerts(
  inflation: InflationSignal,
  scarcity: EnhancedPositionScarcitySignal[],
  categoryGaps: CategoryGapSignal[],
  budget: BudgetCurveSignal,
): DraftAlert[] {
  const alerts: DraftAlert[] = [];

  // Inflation alert: trigger at > 15% over market (severity 0.30+)
  // Surface at severity > 0.65 = inflation > ~32%
  if (inflation.confidence === "high" && inflation.inflationFactor > 1.15) {
    const severity = Math.min(1.0, (inflation.inflationFactor - 1.0) / 0.5);
    if (severity > 0.65) {
      alerts.push({
        id: "inflation",
        type: "inflation",
        severity,
        title: `Market inflated ${inflation.percentOverMarket}%`,
        detail: `Players costing ${inflation.percentOverMarket}% above projected value`,
        timestamp: Date.now(),
      });
    }
  }

  // Scarcity alerts
  scarcity
    .filter(s => s.scarcityIndex > 0.65)
    .forEach(s => {
      alerts.push({
        id: `scarcity-${s.position}`,
        type: "scarcity",
        severity: s.scarcityIndex,
        title: `${s.position} scarcity critical`,
        detail: `${s.topPlayersLeft} elite left, ${s.teamsNeeding} teams need it`,
        position: s.position,
        timestamp: Date.now(),
      });
    });

  // Category gap alerts
  categoryGaps
    .filter(g => g.category_risk_score > 0.65)
    .forEach(g => {
      alerts.push({
        id: `cat-${g.category}`,
        type: "category_gap",
        severity: g.category_risk_score,
        title: `${g.category} deficit`,
        detail: `${Math.abs(g.gapZScore).toFixed(1)} std dev below league avg`,
        category: g.category,
        timestamp: Date.now(),
      });
    });

  // Sort by severity descending
  return alerts.sort((a, b) => b.severity - a.severity);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `calculateAuctionValueWithInflation()` — fixed 70% spend assumption | Live ratio of remaining budget / remaining projected value | Phase 20 | Accurate at all draft stages, not just mid-draft |
| `computePositionScarcity()` — binary alert (critical/warning) | Full signal with `scarcity_index`, `tier_drop_value`, demand/supply ratio | Phase 20 | Enables severity scoring, deduplication with alert system |
| `calculateBudgetPacing()` — static 40% rule | Spend curve + inflation-adjusted max bid + budget pressure vs optimal curve | Phase 20 | Actionable per-pick bid recommendation |
| No category gap tracking | Per-category z-score vs league at current draft stage | Phase 20 | Identifies category weaknesses for targeting |

**Deprecated/outdated:**
- `calculateAuctionValueWithInflation()`: Replace with `computeInflation()` output. Old function can remain for compatibility but should not be called from new components.
- `AuctionBudgetTracker.tsx` hardcoded `260` total budget: Replace with `useDraftStore().remainingBudget + spentBudget` computed from picks.

---

## Open Questions

1. **Where does `initialBudget` come from for inflation denominator?**
   - What we know: `remainingBudget` is tracked in Zustand. `totalSpent` can be computed from `allPicks.reduce(sum, p.cost)`. Initial budget = remaining + spent. But if some picks have `cost = undefined` (snake draft picks with no cost), the sum is wrong.
   - What's unclear: Are there auction picks in `allPicks` that have `cost = undefined`?
   - Recommendation: Compute `initialBudget` as `state.remainingBudget + allPicks.filter(p => p.cost !== undefined).reduce(sum, p.cost || 0)` and accept that this may be approximate early in the draft. Also use `detectMyTeam().remainingBudget` as the ground truth for user's budget.

2. **How to get ALL teams' remaining budgets for total remaining budget?**
   - What we know: `detectAllTeamBudgets()` exists and scrapes the pick train. It's called on a 5s polling interval.
   - What's unclear: Should the engine store these in Zustand? Currently they're ephemeral.
   - Recommendation: Add `allTeamBudgets: Array<{teamName: string; remainingBudget: number}>` to Zustand state, populated by the existing 5s poll in content.tsx. The engine reads this for inflation denominator.

3. **Category gap: which categories to track?**
   - What we know: The CONTEXT.md specifies: HR, SB, R, RBI, OPS, ERA, WHIP, K, W, SV. The league categories are detected in `detectLeagueConfig()` and stored in `cachedLeagueConfig`.
   - What's unclear: `cachedLeagueConfig` is a local variable in content.tsx, not in Zustand. The engine needs category definitions.
   - Recommendation: Add `leagueCategories: Category[]` to Zustand state (already in `DraftConfiguration.categories`), set during `initializeDraft()`.

4. **Performance with large `rankings` arrays (500+ players)?**
   - What we know: `rankings` can have 400-500 players. Creating lookup Maps per recompute is O(n).
   - What's unclear: Is 300ms achievable with 500-player lookups on every pick?
   - Recommendation: Create a `rankingsMap = new Map(rankings.map(r => [r.playerId, r]))` once when `rankings` changes (via `useMemo` on rankings alone), pass as a cached argument to engine functions. This avoids recreating per pick.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/extension/lib/draft-state.ts` — full Zustand store structure
- Direct codebase inspection: `packages/extension/lib/value-calculations.ts` — existing inflation + pacing logic
- Direct codebase inspection: `packages/extension/lib/position-scarcity.ts` — existing scarcity model
- Direct codebase inspection: `packages/shared/src/formulas.ts` — SGP, VBD, rate stat functions
- Direct codebase inspection: `packages/shared/src/types.ts` — `DraftRanking`, `AuctionValue`, `StatComponents`
- Direct codebase inspection: `packages/extension/lib/draft-config-detector.ts` — `detectMyTeam()`, `detectAllTeamBudgets()`
- Direct codebase inspection: `packages/extension/entrypoints/content.tsx` — full content script orchestration
- Direct codebase inspection: `packages/extension/components/DraftSidebar.tsx` — sidebar layout structure
- CONTEXT.md — locked architectural decisions and formulas

### Secondary (MEDIUM confidence)
- Phase 11 decisions documented in additional_context — clamp values, thresholds, budget pacing threshold

### Tertiary (LOW confidence)
- None — all critical claims verified against source code.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries needed, all existing
- Architecture: HIGH — direct inspection of all existing modules, clear integration points
- Inflation model: HIGH — formula from CONTEXT.md + edge cases from Phase 11 decisions
- Category gap: HIGH — shared `calculateCategorySGP` already exists, integration is direct
- Budget curve: HIGH — upgrade of existing `calculateBudgetPacing` with clear additions
- Scarcity upgrade: HIGH — existing `computePositionScarcity` provides base, tier data in `DraftRanking.tier`
- Alert system: HIGH — severity formulas are straightforward, threshold locked in CONTEXT.md
- Open questions: MEDIUM — 3 of 4 have recommended solutions, 1 (performance) needs runtime verification

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, no external dependencies to go stale)

# Phase 28 Context: Forward-Looking Draft Simulation

## Source Documents

This phase draws from three design documents:
- `.planning/simulation.md` — Draft simulation architecture
- `.planning/algos.md` — Algorithms & modeling guide
- `structure.md` — System architecture & principles

## What Already Exists (Phases 20-27)

The extension already has a **deterministic draft engine** with:
- Inflation model (remaining budget vs remaining value)
- Positional scarcity (supply/demand/tier_drop/scarcity_index per position)
- Category gap projections (z-score gaps per category)
- Budget curve (budget_pressure, optimal_remaining_spend, max_bid)
- Simplified Monte Carlo (200 sims in `packages/extension/lib/engine/bid-optimizer.ts`)
- Opponent need modeling (`packages/extension/lib/engine/opponent-model.ts`)
- Shopping list with per-position targets
- Projected standings (replacement-level filler for unfilled slots)
- AI narrator (event-triggered LLM tactical commentary)

## What This Phase Adds

### 1. Full Draft Completion Simulation

Current Monte Carlo (Phase 23) simulates ONE pick at a time. The design docs describe simulating the **entire remaining draft to completion**:

```
clone draft state
→ simulate remaining draft picks (all teams)
→ complete all rosters
→ calculate final standings
→ record results
→ repeat 300-1000 times
```

Each simulation:
- Teams select players based on value + need + scarcity + randomness
- Budgets constrain bidding (minBudgetReserve = rosterSpotsRemaining * $1)
- Rosters fill dynamically
- Category balance model tracks deficits

### 2. Standings-Based Decision Comparison

Compare candidate decisions by simulated outcomes:

```
Draft Player A → avg finish 3.4, win prob 22%, top 3 prob 61%
Draft Player B → avg finish 3.1, win prob 28%, top 3 prob 67%
Pass on nomination → avg finish 3.8, win prob 15%, top 3 prob 48%
```

This replaces heuristic "should bid" logic with empirical outcome distribution.

### 3. Probabilistic Team Behavior

Simulated opponents pick probabilistically:

```
P(select player) ∝ score
score = base_value + need_weight + scarcity_weight + randomness
```

Using softmax selection creates realistic variation between simulations.

### 4. Auction Bidding Model

For auction sims:
```
maxBid = playerValue × teamNeedMultiplier × inflation
```

Teams bid incrementally, drop out when maxBid reached, highest remaining wins.

### 5. Nomination Strategy

Which player to nominate to maximize YOUR advantage:
- Expensive players you don't want (drain opponent budgets)
- Positions opponents need (trigger bidding wars)
- High-hype rookies (emotional overpay)

```
analyzeOpponents → detectBudgetPressure → identifyTrapNominations → recommendNomination
```

### 6. Win Probability Distribution

After N simulations, produce:
```
Expected Finish: 3.1
Win Probability: 22%
Top 3 Probability: 59%
Top 6 Probability: 82%
```

## Performance Requirements

From design docs:
```
decision latency < 1 second
300-1000 simulations
10-15 candidate players per evaluation
~200-400ms runtime
```

Strategies:
- Precompute player values
- Cache valuation results
- Limit simulation depth
- Reduce candidate player pool (top 10-20 by value)
- Parallel simulations (Web Workers if needed)

## Key Algorithms (from algos.md)

### Category Balance Model
```
deficit = target - current_team_projection
weight = deficit / target
adjusted_value = base_value * category_weight
```

### Positional Scarcity in Simulation
```
scarcity = remaining_slots / remaining_players
scarcity_multiplier = 1.1-1.3 when nearing depletion
```

### Auction Inflation (Dynamic)
```
inflation = remaining_money / remaining_player_value
inflated_price = base_price * inflation
```

## Architecture Constraints

- **Pure functions**: All simulation code must be pure (no Zustand, no DOM)
- **Client-side**: Runs in Chrome extension, not backend
- **Performance budget**: < 1 second for full simulation run
- **Existing integration**: Feeds into `computeDraftEngine()` orchestrator in `packages/extension/lib/engine/index.ts`
- **Existing types**: Extend `DraftEngineSignals` with simulation results

## Locked Decisions

- Reuse existing `PoolPlayer`, `OpponentModel`, `EnhancedScarcitySignal` types from `packages/extension/lib/engine/types.ts`
- Reuse `buildFgPlayerPool` from `packages/extension/lib/engine/archetype.ts` for player data
- Simulation results surface in sidebar via `EngineInsights.tsx`
- Nomination strategy surfaces as a new section or within existing alerts

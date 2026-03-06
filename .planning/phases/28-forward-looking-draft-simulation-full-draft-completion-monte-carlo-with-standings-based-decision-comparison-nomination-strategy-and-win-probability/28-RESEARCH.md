# Phase 28: Forward-Looking Draft Simulation - Research

**Researched:** 2026-03-06
**Domain:** Monte Carlo draft simulation, standings-based decision evaluation, nomination strategy, win probability
**Confidence:** HIGH

## Summary

Phase 28 evolves the existing single-pick Monte Carlo engine (`monte-carlo.ts`, 200 sims, SGP-based EV) into a full draft completion simulator that evaluates decisions by their impact on projected roto standings rather than raw SGP. The current engine simulates one pick at a time and returns SGP-based expected value. This phase replaces that with a standings-aware simulation that completes the entire remaining draft, computes roto standings from the resulting rosters, and produces win probability distributions.

The key architectural challenge is performance: simulating a full draft to completion for all teams across 300-1000 iterations with standings calculations, all within a 1-second budget in a Chrome extension content script. The existing Monte Carlo already runs 200 sims of single-pick completion in under 50ms (per the test), but full draft completion requires simulating ~100-200 remaining picks per team per simulation, plus a standings calculation at the end of each. The research below identifies strategies to stay within budget: lightweight standings computation, reduced candidate pools, and caching pre-computed values.

**Primary recommendation:** Build a `simulateFullDraft()` function that completes the entire remaining draft using softmax-weighted selection per team, then feed completed rosters into a lightweight roto standings calculator. Wrap this in a `compareDecisions()` function that runs N simulations for each candidate action and returns a `SimulationOutcome` with expected finish, win probability, and top-3/top-6 probabilities. Add a separate `recommendNomination()` function that uses opponent models to identify trap nominations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Reuse existing `PoolPlayer`, `OpponentModel`, `EnhancedScarcitySignal` types from `packages/extension/lib/engine/types.ts`
- Reuse `buildFgPlayerPool` from `packages/extension/lib/engine/archetype.ts` for player data
- Simulation results surface in sidebar via `EngineInsights.tsx`
- Nomination strategy surfaces as a new section or within existing alerts
- Pure functions: All simulation code must be pure (no Zustand, no DOM)
- Client-side: Runs in Chrome extension, not backend
- Performance budget: < 1 second for full simulation run
- Existing integration: Feeds into `computeDraftEngine()` orchestrator in `packages/extension/lib/engine/index.ts`
- Existing types: Extend `DraftEngineSignals` with simulation results

### Claude's Discretion
- Simulation count (300-1000 range per design docs)
- Softmax temperature parameter for team behavior modeling
- Depth of standings calculation (full roto vs. simplified)
- Whether to use Web Workers for parallelization
- Nomination strategy algorithm details
- Caching strategy for simulation results
- How many candidate decisions to evaluate per simulation run

### Deferred Ideas (OUT OF SCOPE)
- Reinforcement learning draft agents (design doc future enhancement)
- Opponent behavior modeling beyond current OpponentModel (risk tolerance, rookie bias, etc.)
- Snake draft simulation (auction only for this phase)
- WebGPU/WASM acceleration
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | existing | Pure function implementation | Already used for all engine code |
| Vitest | existing | Unit + performance testing | Already used for monte-carlo.test.ts pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | - | - | All computation uses built-in JS/TS. No new deps needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Main thread | Web Workers | Adds messaging overhead + bundling complexity for WXT. Only justified if single-thread exceeds 1s budget. Start without, add if needed. |
| Full roto standings calc | Simplified counting-stat-only ranking | Loses rate stat accuracy but 5-10x faster. Not recommended given existing `computeRotoPts` is already fast. |

**Installation:**
```bash
# No new packages needed. All computation is pure TypeScript using existing project dependencies.
```

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/lib/engine/
  draft-simulator.ts       # Full draft completion simulation (simulateFullDraft, softmax selection)
  decision-comparison.ts   # compareDecisions(), SimulationOutcome types
  nomination-strategy.ts   # recommendNomination(), trap nomination identification
  types.ts                 # Extended with SimulationOutcome, NominationRecommendation, etc.
  monte-carlo.ts           # EXISTING — retained for backwards compat, or refactored to delegate
  index.ts                 # EXISTING — extended to call compareDecisions when simulation budget allows
```

### Pattern 1: Full Draft Completion Simulation
**What:** Simulate the entire remaining draft to completion for all teams, then compute roto standings from the completed rosters.
**When to use:** Every time a new pick is made or a nomination changes.
**Example:**
```typescript
// Source: Design docs (simulation.md, algos.md)

interface SimDraftState {
  availableIndices: Set<number>;     // O(1) delete per Phase 23 decision
  teamStates: SimTeamState[];        // One per team (budget, filled slots, category totals)
  myTeamIndex: number;               // Which team is "me"
}

interface SimTeamState {
  budget: number;
  slotsRemaining: Record<string, number>;  // Mutable copy of roster slots
  categoryTotals: Record<string, number>;  // Running stat totals for standings
  componentTotals: Record<string, number>; // Running components for rate stats (H, AB, IP, ER, etc.)
}

function simulateFullDraft(
  players: PoolPlayer[],
  sgpValues: number[],
  categories: Category[],
  initialState: SimDraftState,
  temperature: number,          // Softmax temperature for opponent selection
): SimDraftState {
  const state = cloneSimState(initialState);

  // Round-robin: each team picks one player per round
  // until all rosters are full or no players remain
  while (state.availableIndices.size > 0) {
    let anyTeamPicked = false;
    for (let t = 0; t < state.teamStates.length; t++) {
      const team = state.teamStates[t];
      const totalSlots = Object.values(team.slotsRemaining)
        .reduce((s, v) => s + v, 0);
      if (totalSlots === 0) continue;

      // Select player via softmax-weighted scoring
      const playerIdx = softmaxSelect(
        state.availableIndices,
        players,
        sgpValues,
        team,
        temperature,
      );
      if (playerIdx < 0) continue;

      // "Draft" the player: update team state, remove from pool
      draftPlayerToTeam(state, t, playerIdx, players);
      anyTeamPicked = true;
    }
    if (!anyTeamPicked) break;
  }

  return state;
}
```

### Pattern 2: Softmax-Weighted Player Selection
**What:** Probabilistic player selection using softmax over composite scores, creating realistic variation between simulations.
**When to use:** In `simulateFullDraft` for each team's pick decision.
**Example:**
```typescript
// Source: simulation.md "Probabilistic Player Selection" section

function softmaxSelect(
  available: Set<number>,
  players: PoolPlayer[],
  sgpValues: number[],
  team: SimTeamState,
  temperature: number,
): number {
  const candidates: Array<{ idx: number; score: number }> = [];
  const totalSlots = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
  const reserve = Math.max(0, totalSlots - 1);
  const maxSpend = Math.max(1, team.budget - reserve);

  for (const idx of available) {
    const player = players[idx];
    if (player.dollars > maxSpend) continue;
    if (!fitsSlot(player, team.slotsRemaining)) continue;

    // Composite score: SGP + need boost + scarcity
    const baseScore = sgpValues[idx] ?? 0;
    const needBoost = computeNeedBoost(player, team);      // Category deficit weighting
    const score = Math.max(0.01, baseScore + needBoost);   // Floor to avoid zero
    candidates.push({ idx, score });
  }

  if (candidates.length === 0) return -1;

  // Softmax: P(i) = exp(score_i / T) / sum(exp(score_j / T))
  const maxScore = Math.max(...candidates.map(c => c.score));
  const expScores = candidates.map(c =>
    Math.exp((c.score - maxScore) / temperature)  // Subtract max for numerical stability
  );
  const sumExp = expScores.reduce((s, v) => s + v, 0);

  // Weighted random selection
  let r = Math.random() * sumExp;
  for (let i = 0; i < candidates.length; i++) {
    r -= expScores[i];
    if (r <= 0) return candidates[i].idx;
  }
  return candidates[candidates.length - 1].idx;
}
```

### Pattern 3: Standings-Based Decision Comparison
**What:** Run N simulations for each candidate decision (bid, pass, or specific player), compute roto standings from each completed draft, aggregate into win probability distributions.
**When to use:** When a player is nominated, compare "bid at price X" vs "pass" vs alternative bids.
**Example:**
```typescript
// Source: simulation.md "Decision Selection" + algos.md "Expected Standings Value"

interface SimulationOutcome {
  expectedFinish: number;       // Average final roto rank (1 = first)
  winProbability: number;       // Fraction of sims finishing 1st
  top3Probability: number;      // Fraction finishing top 3
  top6Probability: number;      // Fraction finishing top 6
  expectedRotoPts: number;      // Average roto points
  stdDevRotoPts: number;        // Standard deviation of roto points
  simCount: number;
}

interface DecisionComparison {
  decisions: Array<{
    label: string;              // "Bid $25 on Soto", "Pass", etc.
    outcome: SimulationOutcome;
  }>;
  recommendedAction: string;    // Label of best decision
  computeTimeMs: number;
}

function compareDecisions(
  candidateActions: CandidateAction[],  // e.g., [{type:"bid", player, price}, {type:"pass"}]
  baseState: SimDraftState,
  players: PoolPlayer[],
  sgpValues: number[],
  categories: Category[],
  simsPerDecision: number,       // 200-500
  temperature: number,
): DecisionComparison { ... }
```

### Pattern 4: Lightweight Roto Standings from Simulation
**What:** After draft completion, compute roto standings from accumulated category totals without the full `computeProjectedStandings` pipeline.
**When to use:** At the end of each simulated draft completion.
**Example:**
```typescript
// Source: projected-standings.ts computeRotoPts pattern (adapted for sim state)

function computeSimStandings(
  teamStates: SimTeamState[],
  categories: Category[],
): number[] {  // Returns roto points per team (parallel array)
  const teamCount = teamStates.length;
  const rotoPts = new Array(teamCount).fill(0);

  for (const cat of categories) {
    // Extract values and sort
    const values: Array<{ teamIdx: number; value: number }> = [];
    for (let t = 0; t < teamCount; t++) {
      let value: number;
      if (cat.type === "COUNTING") {
        value = teamStates[t].categoryTotals[cat.stat_key] ?? 0;
      } else {
        // Rate stat: compute from components
        value = computeRateFromComponents(cat, teamStates[t].componentTotals);
      }
      values.push({ teamIdx: t, value });
    }

    // Sort and assign roto points (N for rank 1, 1 for rank N)
    if (cat.direction === "LOWER_BETTER") {
      values.sort((a, b) => {
        if (a.value === 0) return 1;
        if (b.value === 0) return -1;
        return a.value - b.value;
      });
    } else {
      values.sort((a, b) => b.value - a.value);
    }

    for (let i = 0; i < values.length; i++) {
      rotoPts[values[i].teamIdx] += teamCount - i;
    }
  }

  return rotoPts;
}
```

### Pattern 5: Nomination Strategy
**What:** Analyze opponent state to identify players that, when nominated, will drain opponent budgets or trigger bidding wars without benefiting you.
**When to use:** When it's the user's turn to nominate.
**Example:**
```typescript
// Source: algos.md "Nomination Strategy Model"

interface NominationRecommendation {
  player: PoolPlayer;
  reason: string;
  expectedDrain: number;    // Estimated budget drain on opponents
  trapScore: number;        // 0-1, higher = better trap nomination
}

function recommendNomination(
  availablePlayers: PoolPlayer[],
  sgpValues: number[],
  myTeamState: SimTeamState,
  opponentModel: OpponentModel,
  opponentStates: SimTeamState[],  // Could be simplified opponent snapshots
): NominationRecommendation[] {
  // Heuristic scoring for each candidate nomination:
  // 1. High-value players I don't want (expensive + position filled)
  // 2. Players at positions multiple opponents need (trigger bidding war)
  // 3. Players with high "hype" factor (high dollar value, will draw bids)

  // Score: opponentNeedCount * expectedPrice * (1 - myNeedScore)
  // Sort descending, return top 3-5
}
```

### Anti-Patterns to Avoid
- **Computing full SGP vectors inside each simulation:** SGP vectors are constant for a given pool. Compute once, pass as parameter.
- **Using `Array.splice()` for player removal:** Violates Phase 23 decision. Use `Set<number>` with O(1) delete.
- **Computing rate stats by averaging rates:** Must use component-based math (H/AB for AVG, not mean of AVGs). Track components in SimTeamState.
- **Running full `computeProjectedStandings()` per sim:** Too heavy. Use the lightweight inline standings calculator.
- **Mutating shared state between simulations:** Each sim must clone the initial state. Use `cloneSimState()`.
- **Evaluating all available players for every team pick:** Use top-K filtering (top 10-20 candidates by score) to reduce candidate pool per selection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Roto standings ranking | New ranking algorithm | Adapt existing `computeRotoPts` pattern from `projected-standings.ts` | Already handles LOWER_BETTER, zero-value edge cases, roto point assignment |
| Rate stat computation | Custom rate formulas | Use `calculateFinalRate` from `@espn-fantasy/shared` | Component math is already correct, handles edge cases |
| Player pool construction | New pool builder | Use `buildFgPlayerPool` from `archetype.ts` | Already handles name normalization, stat mapping, position parsing |
| Opponent modeling | New opponent model | Use `buildOpponentModel` from `opponent-model.ts` | Already computes team needs, budgets, competition factors |
| Slot assignment | New position matching | Adapt `findBestSlot` from `roster-optimizer.ts` | Already handles dedicated vs flex slots, priority ordering |

**Key insight:** The existing engine has all the building blocks. The simulation layer composes them in a loop with stochastic selection, then applies standings evaluation. The new code is primarily orchestration and the softmax selection model.

## Common Pitfalls

### Pitfall 1: Performance Budget Exceeded
**What goes wrong:** 500 sims * 200 remaining picks * 12 teams * standings calculation = billions of operations, blowing past 1 second.
**Why it happens:** Naive implementation evaluates every player for every team pick in every simulation.
**How to avoid:**
- Pre-filter candidate pool to top 20-30 by SGP (not all 200 players).
- Track category totals incrementally (add player stats on draft, don't recompute from scratch).
- Use simple array-based standings (not Map/object creation per sim).
- Target 300 sims initially, increase if under budget.
- Profile early and often.
**Warning signs:** `computeTimeMs > 500` in tests with realistic pool sizes.

### Pitfall 2: Numerical Instability in Softmax
**What goes wrong:** `exp(score / temperature)` overflows to Infinity when scores are large or temperature is small.
**Why it happens:** Raw SGP values can range from -5 to +15. With temperature=0.5, exp(15/0.5) = exp(30) ~= 1e13.
**How to avoid:** Subtract the maximum score before exponentiating: `exp((score - maxScore) / T)`. This is the standard numerical stability trick for softmax.
**Warning signs:** NaN or Infinity in selection probabilities.

### Pitfall 3: Rate Stat Averaging Instead of Component Math
**What goes wrong:** Averaging ERA values across players gives wrong team ERA. ERA 2.00 over 200 IP + ERA 4.00 over 50 IP != ERA 3.00.
**Why it happens:** Rate stats must be computed from summed components, not averaged.
**How to avoid:** Track component totals (H, AB, IP, ER, BB, etc.) in SimTeamState.componentTotals. Compute rates only at standings time using `calculateFinalRate`.
**Warning signs:** Projected standings that don't match `computeProjectedStandings` output for the same rosters.

### Pitfall 4: Simulation Not Producing Variation
**What goes wrong:** All 300 sims produce nearly identical outcomes, making win probability meaningless.
**Why it happens:** Temperature too low (too deterministic) or candidate pool too small.
**How to avoid:** Use temperature in range 0.5-2.0. Start with 1.0. Add noise to need-based scoring. Ensure candidate pool has 10+ players per team pick.
**Warning signs:** Standard deviation of roto points near zero across simulations.

### Pitfall 5: Stale Simulation Cache
**What goes wrong:** User sees outdated simulation results that don't reflect the latest pick.
**Why it happens:** Simulation is expensive, so it's cached. But cache key doesn't capture all relevant state changes.
**How to avoid:** Use `allPicks.length + '_' + currentAuctionPlayerId` as cache key (same pattern as existing `bidCacheKey` in index.ts). Invalidate on any pick count change.
**Warning signs:** Simulation output doesn't change after a new player is drafted.

### Pitfall 6: Incorrect Budget Constraints in Simulation
**What goes wrong:** Simulated teams spend more than their budget or leave money for unfillable slots.
**Why it happens:** Budget reservation logic doesn't account for minimum $1 per remaining slot.
**How to avoid:** At each simulated pick: `maxSpend = budget - (slotsRemaining - 1)`. This ensures $1 reserved per future slot.
**Warning signs:** Simulated teams ending with negative budget or >$1 per unfilled slot remaining.

## Code Examples

### Incremental Category Total Tracking
```typescript
// When a player is "drafted" in simulation, update team totals incrementally
// rather than recomputing from the full roster.

function draftPlayerToTeam(
  state: SimDraftState,
  teamIdx: number,
  playerIdx: number,
  players: PoolPlayer[],
): void {
  const team = state.teamStates[teamIdx];
  const player = players[playerIdx];

  // Remove from available pool
  state.availableIndices.delete(playerIdx);

  // Update budget
  team.budget -= player.dollars;

  // Update slot tracking (simplified — first matching slot)
  for (const pos of player.positions) {
    const upper = pos.toUpperCase();
    if (team.slotsRemaining[upper] && team.slotsRemaining[upper] > 0) {
      team.slotsRemaining[upper]--;
      break;
    }
    // Check flex slots (CI, MI, UTIL, P)
    // ... simplified slot assignment
  }

  // Incrementally update category totals (the key optimization)
  for (const [key, value] of Object.entries(player.stats)) {
    team.categoryTotals[key] = (team.categoryTotals[key] ?? 0) + value;
    team.componentTotals[key] = (team.componentTotals[key] ?? 0) + value;
  }
}
```

### Efficient State Cloning
```typescript
// Clone sim state without deep-cloning the player pool (which is read-only)

function cloneSimState(state: SimDraftState): SimDraftState {
  return {
    availableIndices: new Set(state.availableIndices),
    myTeamIndex: state.myTeamIndex,
    teamStates: state.teamStates.map(t => ({
      budget: t.budget,
      slotsRemaining: { ...t.slotsRemaining },
      categoryTotals: { ...t.categoryTotals },
      componentTotals: { ...t.componentTotals },
    })),
  };
}
```

### Top-K Candidate Filtering
```typescript
// Instead of scoring all available players, pre-sort by SGP and only consider top K.
// This reduces softmax computation from O(n) to O(K) per team pick.

function getTopKCandidates(
  available: Set<number>,
  sgpValues: number[],
  team: SimTeamState,
  k: number = 15,
): number[] {
  // Quick filter: must be affordable and fit a slot
  const totalSlots = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
  const maxSpend = Math.max(1, team.budget - Math.max(0, totalSlots - 1));

  const eligible: Array<{ idx: number; sgp: number }> = [];
  for (const idx of available) {
    // Budget check first (cheapest filter)
    if (players[idx].dollars > maxSpend) continue;
    eligible.push({ idx, sgp: sgpValues[idx] ?? 0 });
  }

  // Partial sort: get top K by SGP (using selection algorithm or full sort for small K)
  eligible.sort((a, b) => b.sgp - a.sgp);
  return eligible.slice(0, k).map(e => e.idx);
}
```

### Simulation Outcome Aggregation
```typescript
// After running N simulations, aggregate standings into probability distributions.

function aggregateOutcomes(
  myTeamIndex: number,
  allSimRotoPts: number[][],  // [sim][team] -> roto points
  teamCount: number,
): SimulationOutcome {
  const n = allSimRotoPts.length;
  let totalFinish = 0;
  let wins = 0;
  let top3 = 0;
  let top6 = 0;
  let totalPts = 0;
  const ptsArray: number[] = [];

  for (const simPts of allSimRotoPts) {
    const myPts = simPts[myTeamIndex];
    ptsArray.push(myPts);
    totalPts += myPts;

    // Compute rank: count teams with more points
    let rank = 1;
    for (let t = 0; t < teamCount; t++) {
      if (t !== myTeamIndex && simPts[t] > myPts) rank++;
    }

    totalFinish += rank;
    if (rank === 1) wins++;
    if (rank <= 3) top3++;
    if (rank <= 6) top6++;
  }

  const expectedRotoPts = totalPts / n;
  const variance = ptsArray.reduce((s, v) => s + Math.pow(v - expectedRotoPts, 2), 0) / n;

  return {
    expectedFinish: totalFinish / n,
    winProbability: wins / n,
    top3Probability: top3 / n,
    top6Probability: top6 / n,
    expectedRotoPts,
    stdDevRotoPts: Math.sqrt(variance),
    simCount: n,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SGP-based EV (current monte-carlo.ts) | Standings-based EV (this phase) | Phase 28 | Decisions evaluated by actual standings impact, not proxy metric |
| Single-pick simulation | Full draft completion | Phase 28 | Captures downstream cascading effects of each decision |
| Deterministic shouldBid | Probabilistic win probability | Phase 28 | Quantifies risk, not just direction |
| No nomination strategy | Opponent-aware trap nominations | Phase 28 | Actively shapes draft dynamics |

**Not changing:**
- SGP computation (sgp.ts) remains the base valuation layer
- Roster optimizer (roster-optimizer.ts) can be reused for "my team" final optimization
- Opponent model (opponent-model.ts) feeds into simulation team behavior

## Performance Budget Analysis

### Estimated Time Breakdown (300 sims, 12 teams, 100 remaining picks)

| Operation | Per Sim | x300 Sims | Notes |
|-----------|---------|-----------|-------|
| State cloning | 0.01ms | 3ms | Shallow copy of team states + Set copy |
| Draft simulation (100 picks * 12 teams) | 0.5-1.0ms | 150-300ms | Top-15 softmax per pick, incremental totals |
| Standings calculation | 0.05ms | 15ms | Sort 12 values per category, ~10 categories |
| Outcome aggregation | - | 1ms | Simple counting |
| **Total** | **~1ms** | **~300ms** | **Within 1s budget** |

### Key Performance Decisions
1. **300 sims initially** (not 1000). Increase if under budget.
2. **Top-15 candidates per pick** (not all available).
3. **Incremental category totals** (not full roster recomputation).
4. **No Web Workers initially.** Estimated 300ms is well within budget. Add Workers only if profiling shows need.
5. **Evaluate 2-3 decisions per nomination** (bid at max, bid at market, pass). Not 10-15.
6. **Cache simulation results per allPicks.length + nominatedPlayerId.**

## Recommended Softmax Temperature

Based on research, temperature = 1.0 is the standard starting point:
- **T = 0.5:** Very peaked distribution. Top SGP player picked ~80% of time. Too deterministic, low simulation variance.
- **T = 1.0:** Moderate randomness. Top player picked ~40-50% of time. Good balance of realism and variation.
- **T = 2.0:** High randomness. Flattened distribution. Simulates "bad" teams that make suboptimal picks.

**Recommendation:** Use T = 1.0 as default. The current `weightedShuffle` in monte-carlo.ts uses a similar approach (jitter factor 0.8-1.2) but is less principled. Softmax with temperature is the standard approach for probabilistic selection in game simulation.

## Integration with Existing Engine

### DraftEngineSignals Extension
```typescript
// Extend existing DraftEngineSignals in types.ts
export interface DraftEngineSignals {
  // ... existing fields ...
  simulation: ForwardSimulationSignal | null;  // New field
}

export interface ForwardSimulationSignal {
  currentDecision: DecisionComparison | null;  // Bid vs pass comparison
  winProbability: SimulationOutcome | null;     // Current baseline win probability
  nominationStrategy: NominationRecommendation[] | null;  // Top 3-5 nominations
  computeTimeMs: number;
}
```

### Orchestrator Integration (index.ts)
The simulation should run AFTER roster optimization (step 6), using the same SGP vectors, player pool, and opponent model. It replaces the current `runMonteCarlo` call or supplements it with richer output.

### UI Integration (EngineInsights.tsx)
Add two new collapsible sections:
1. **Win Probability** — Shows current expected finish, win%, top-3%. If a player is nominated, shows bid vs pass comparison.
2. **Nomination Strategy** — When it's your turn to nominate, shows top 3-5 recommended nominations with trap scores and reasons.

## Open Questions

1. **How to model auction bidding dynamics in simulation?**
   - What we know: Design doc says `maxBid = playerValue * teamNeedMultiplier * inflation`, with teams dropping out when exceeded.
   - What's unclear: How to efficiently simulate a multi-team auction within each sim without it becoming the bottleneck. A full auction simulation (increment by $1, check each team) for 100 players would be very slow.
   - Recommendation: Simplify auction to instant resolution: each team computes maxBid, highest bidder wins at their price. Skip incremental bidding. This trades realism for speed.

2. **Should nomination strategy use the full simulation or heuristics?**
   - What we know: Running full sims for each candidate nomination (N nominations * M sims) could be very expensive (5-10x the base simulation budget).
   - What's unclear: Whether heuristic-based nomination (opponent need * player value * budget drain potential) is good enough.
   - Recommendation: Start with heuristics using existing OpponentModel data. Simulation-backed nomination evaluation is a future enhancement.

3. **How to handle the transition from existing MonteCarloResult to new SimulationOutcome?**
   - What we know: Existing code references `monteCarloResult.shouldBid`, `monteCarloResult.bidEV`, etc.
   - What's unclear: Whether to deprecate the old interface or keep both.
   - Recommendation: Keep `MonteCarloResult` for backwards compat. Add `ForwardSimulationSignal` as a new field on `DraftEngineSignals`. The old Monte Carlo becomes the "fast path" when full simulation is too expensive (e.g., very early in draft with 200+ picks remaining).

## Sources

### Primary (HIGH confidence)
- `packages/extension/lib/engine/monte-carlo.ts` — Current simulation implementation (read in full)
- `packages/extension/lib/engine/types.ts` — All existing type definitions (read in full)
- `packages/extension/lib/engine/index.ts` — Engine orchestrator with caching and integration patterns (read in full)
- `packages/extension/lib/engine/projected-standings.ts` — Roto standings calculation with rate stat handling (read in full)
- `packages/extension/lib/engine/roster-optimizer.ts` — Greedy knapsack with slot assignment (read in full)
- `packages/extension/lib/engine/opponent-model.ts` — Opponent need and market price estimation (read in full)
- `packages/extension/lib/engine/sgp.ts` — SGP valuation model (read in full)
- `packages/extension/lib/engine/shopping-list.ts` — Position-grouped target computation (read in full)
- `.planning/simulation.md` — Draft simulation design document (read in full)
- `.planning/algos.md` — Algorithms and modeling guide (read in full)
- `structure.md` — System architecture and principles (read in full)
- CONTEXT.md — Phase 28 user decisions and constraints (read in full)

### Secondary (MEDIUM confidence)
- [Softmax Temperature - Baeldung](https://www.baeldung.com/cs/softmax-temperature) — Temperature parameter behavior and selection
- [Monte Carlo Simulation in Fantasy Sports - Medium](https://medium.com/@tdmiller89/how-the-monte-carlo-simulation-can-be-used-in-fantasy-sports-d53377fc04ff) — Fantasy sports simulation methodology
- [Offscreen Documents - Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — Web Worker options in Chrome extensions
- [JavaScript vs WASM Monte Carlo](https://polyglot.codes/posts/webassembly-monte-carlo/) — V8 JavaScript performance for numerical computation

### Tertiary (LOW confidence)
- Performance budget estimates are based on analysis of existing monte-carlo.test.ts timing (200 sims with 50 players in <50ms) extrapolated to full draft completion. Needs validation with actual profiling.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, pure TypeScript computation using existing patterns
- Architecture: HIGH - Clear decomposition based on design docs, existing code patterns, and well-understood Monte Carlo methodology
- Pitfalls: HIGH - Derived from direct code reading and established numerical computing best practices
- Performance budget: MEDIUM - Estimated from existing timing data, but full draft completion at scale needs profiling to validate

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no external dependency changes expected)

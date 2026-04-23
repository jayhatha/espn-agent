# Phase 9: Transaction Impact Analysis - Research

**Researched:** 2026-02-22
**Domain:** Statistical methodology for roster move impact modeling in rotisserie fantasy baseball
**Confidence:** HIGH

## Summary

Transaction impact analysis in fantasy baseball is fundamentally a causal inference problem requiring counterfactual modeling of "what would have happened if this move wasn't made?" The current implementation uses per-move counterfactuals but encounters the additivity problem where individual move impacts don't sum to the net roster value—a well-known issue in value attribution with overlapping contributions.

Statistical research from sabermetrics, causal inference, and game theory provides three key insights:

1. **Shapley values solve the additivity problem** through efficiency guarantees—individual contributions provably sum to total value
2. **WPA methodology demonstrates context-dependent value attribution** that accounts for rank-based nonlinear effects
3. **Standings Gain Points (SGP) provides the standard fantasy baseball value metric** for converting heterogeneous categories to a common scale

The current `computeNetRosterValue` approach is statistically sound as a single counterfactual avoiding double-counting. However, per-move impacts should be reconceived as Shapley values measuring each move's average marginal contribution across all possible move orderings, which will correctly sum to the net roster value while preserving interpretability.

**Primary recommendation:** Use Shapley values for per-move impact attribution, SGP-based metrics for category impact measurement, and confidence intervals via bootstrap resampling for uncertainty quantification.

## Standard Stack

### Core Statistical Methods

| Method | Purpose | Why Standard |
|---------|---------|--------------|
| Shapley Value Attribution | Per-move impact decomposition | Only method with proven additivity property; widely used in sports analytics for overlapping contributions |
| Standings Gain Points (SGP) | Category value normalization | Industry standard in fantasy baseball for converting diverse stats to common scale |
| Counterfactual Analysis (Rubin Framework) | Causal impact estimation | Gold standard for causal inference from observational data since 1974 |
| Bootstrap Resampling | Uncertainty quantification | Non-parametric method for confidence intervals without distributional assumptions |

### Supporting Methods

| Method | Purpose | When to Use |
|---------|---------|-------------|
| Replacement-Level Benchmarking | Draft pick valuation | When comparing moves to opportunity cost (what was available) |
| Rolling Window Analysis | Temporal impact weighting | When mid-season context matters (playoff races, hot streaks) |
| SGP Rate Stat Adjustment | Nonlinear category effects | ALWAYS for rate stats (AVG, ERA, WHIP)—linear approximations fail |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shapley Values | Simple delta (current approach) | Simpler but violates additivity—impacts don't sum to net value |
| SGP | Z-scores | Z-scores don't account for position scarcity or replacement level |
| Bootstrap CI | Bayesian credible intervals | Bayesian requires prior distributions; bootstrap is model-free |

**Installation:**

Methods are algorithmic patterns, not libraries. Implementation uses existing tools:
- Shapley: Custom implementation iterating over move coalitions
- SGP: Custom calculation from league standings distributions
- Bootstrap: Can use standard statistical libraries or custom implementation

## Architecture Patterns

### Recommended Computation Structure

```
Impact Analysis Flow:
1. Net Roster Value (single counterfactual)
   └─ Draft-only vs actual final standings
   └─ ONE computation, no overlap

2. Shapley Move Attribution (decomposes net value)
   ├─ For each move M:
   │   └─ Average marginal contribution across all orderings
   │       └─ Sample coalitions: moves before M
   │       └─ Compute: value(coalition + M) - value(coalition)
   │   └─ Average over samples
   └─ Property: Σ Shapley(move_i) = Net Roster Value

3. Category Impact (SGP-based)
   ├─ Convert actual stats to SGP
   ├─ Convert counterfactual stats to SGP
   └─ Delta SGP = category impact in standings points

4. Uncertainty Quantification
   └─ Bootstrap resample player period stats
   └─ Recompute impacts on each sample
   └─ Report 95% confidence intervals
```

### Pattern 1: Shapley Value Computation

**What:** Average marginal contribution across all possible move orderings
**When to use:** Attributing net roster value to individual moves with additivity guarantee

**Conceptual example:**
```typescript
// Shapley value for a single move
async function computeShapleyValue(
  targetMove: RosterMove,
  allMoves: RosterMove[],
  numSamples: number = 1000
): Promise<number> {
  let totalMarginalContribution = 0;

  // Sample random coalitions (subsets of other moves)
  for (let i = 0; i < numSamples; i++) {
    // Random ordering of all moves
    const ordering = shuffle([...allMoves]);
    const targetIndex = ordering.findIndex(m => m.id === targetMove.id);

    // Coalition = moves appearing before target in this ordering
    const coalition = ordering.slice(0, targetIndex);

    // Marginal contribution = value with move - value without move
    const valueWith = await computeRotoPoints(coalition.concat(targetMove));
    const valueWithout = await computeRotoPoints(coalition);

    totalMarginalContribution += (valueWith - valueWithout);
  }

  return totalMarginalContribution / numSamples;
}

// Property: Sum of all Shapley values = Net Roster Value
// Σ computeShapleyValue(move_i) = actualPoints - draftOnlyPoints
```

### Pattern 2: SGP Category Normalization

**What:** Convert heterogeneous category stats to standings points
**When to use:** ALWAYS when measuring category impact—essential for comparing diverse metrics

**Conceptual example:**
```typescript
// SGP calculation for counting stat
function countingStatSGP(playerValue: number, sgpFactor: number): number {
  return playerValue / sgpFactor;
}

// SGP calculation for rate stat (batting average)
function rateStatSGP(
  playerHits: number,
  playerAB: number,
  teamHits: number,
  teamAB: number,
  leagueAvg: number,
  sgpFactor: number
): number {
  // Add player to team
  const newTeamAvg = (playerHits + teamHits) / (playerAB + teamAB);

  // Impact on team average
  const delta = newTeamAvg - leagueAvg;

  return delta / sgpFactor;
}

// SGP factors computed from league standings distributions
// Example: If top team is 10 HR ahead of second, SGP_HR ≈ 10
```

### Pattern 3: Replacement-Level Counterfactual

**What:** Instead of "what did dropped player do elsewhere," use "what would replacement-level produce"
**When to use:** When dropped player left league or sat on bench (no actual production data)

**Conceptual example:**
```typescript
// Current approach: uses dropped player's actual production elsewhere
const lostCounterfactual = await sumPlayerContributionAnywhere(
  droppedPlayerId, dropDate, seasonEnd
);

// Replacement-level approach: uses waiver-wire baseline
const replacementLevel = await computeReplacementLevelBaseline(
  droppedPlayerPosition, dropDate, seasonEnd
);

// Which to use?
// - If dropped player played elsewhere: actual > replacement (more accurate)
// - If dropped player disappeared: replacement (only option)
// - For draft pick analysis: replacement (measures drafting skill vs. availability)
```

### Pattern 4: Bootstrap Confidence Intervals

**What:** Resample player period stats, recompute impacts, report percentiles
**When to use:** Communicating uncertainty to users, flagging low-confidence impacts

**Conceptual example:**
```typescript
async function bootstrapImpactCI(
  move: RosterMove,
  numBootstraps: number = 1000
): Promise<{ impact: number; ci_low: number; ci_high: number }> {
  const impacts: number[] = [];

  for (let i = 0; i < numBootstraps; i++) {
    // Resample player period stats with replacement
    const resampledStats = await resamplePlayerPeriodStats();

    // Recompute impact with resampled data
    const impact = await computeMoveImpact(move, resampledStats);
    impacts.push(impact);
  }

  // Sort and extract 2.5th and 97.5th percentiles (95% CI)
  impacts.sort((a, b) => a - b);
  const ci_low = impacts[Math.floor(numBootstraps * 0.025)];
  const ci_high = impacts[Math.floor(numBootstraps * 0.975)];
  const impact = impacts[Math.floor(numBootstraps * 0.5)]; // median

  return { impact, ci_low, ci_high };
}
```

### Anti-Patterns to Avoid

- **Summing per-move deltas without Shapley:** Leads to double-counting when moves interact (actual - counterfactual overlaps across moves)
- **Linear approximation for rate stats:** AVG/ERA/WHIP changes are rank-dependent and nonlinear—must use SGP weighting
- **Ignoring uncertainty:** Small sample sizes (early-season moves, injured players) have wide confidence intervals—flag them
- **Using dropped player's production on YOUR team:** Counterfactual is "what if you KEPT them"—use their production ELSEWHERE or replacement level
- **Averaging rate stats directly:** Always use component math (H/AB, ER/IP)—never average AVG or ERA across periods

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shapley value computation | Custom coalition iteration | Sample-based approximation with random orderings | Exact computation is 2^n (exponential)—practical solutions use Monte Carlo sampling |
| SGP factor calculation | Manual league analysis | Automated distribution analysis from standings data | SGP factors are league-specific and change throughout season |
| Confidence intervals | Manual percentile calculation | Bootstrap resampling framework | Bootstrap is proven method for non-normal distributions |
| Replacement level definition | Arbitrary threshold | Position-specific percentile from roster data | Replacement level varies by position (catcher vs. OF) and league depth |
| Rate stat counterfactuals | Direct subtraction | Component-based recomputation | Rate stats are nonlinear—must recalculate from components (H, AB, IP) |

**Key insight:** Transaction impact analysis involves well-studied statistical problems (causal inference, value attribution, uncertainty quantification). Don't invent new approaches—use established methods with proven properties.

## Common Pitfalls

### Pitfall 1: The Additivity Trap
**What goes wrong:** Summing per-move impacts (actual - counterfactual) exceeds net roster value
**Why it happens:** Each move's counterfactual assumes "all other moves still happened"—this double-counts overlapping contributions
**How to avoid:** Use Shapley values OR report only net roster value without decomposition
**Warning signs:** Sum of move impacts ≠ (actual points - draft-only points)

**Current implementation status:** `computeImpacts` falls into this trap. `computeNetRosterValue` correctly avoids it.

### Pitfall 2: Wrong Counterfactual for Dropped Players
**What goes wrong:** Using dropped player's production on their NEW team as counterfactual for keeping them on YOUR team
**Why it happens:** Conflating "what they did" with "what they would have done for you" (different lineup slots, platoons, categories tracked)
**How to avoid:** Use replacement-level baseline OR dropped player's production normalized for YOUR team context
**Warning signs:** Counterfactual shows dropped player outperformed acquired player, yet your standings improved

**Current implementation status:** Line 562-564 in `transaction-impact.ts` uses `sumPlayerContributionAnywhere`, which is appropriate for roto (same stats count regardless of team) but would be wrong for H2H or points leagues with lineup constraints.

### Pitfall 3: Linear Rate Stat Adjustments
**What goes wrong:** Assuming +10 points of AVG has same standings impact regardless of starting position
**Why it happens:** Treating roto categories as linear when they're rank-based and discrete
**How to avoid:** Always recompute full league rankings with counterfactual; use SGP weighting for marginal impacts
**Warning signs:** Small AVG changes show large impact, or vice versa

**Current implementation status:** Correctly recomputes rate stats from components (lines 602-624) and re-ranks entire league (line 630). Good!

### Pitfall 4: Ignoring Sample Size Effects
**What goes wrong:** Reporting precise impact for moves with minimal data (IL stints, callups, late-season adds)
**Why it happens:** No uncertainty quantification in impact calculations
**How to avoid:** Bootstrap confidence intervals; flag impacts with CI crossing zero as "uncertain"
**Warning signs:** Early-April trade shows larger impact than August blockbuster

**Current implementation status:** No uncertainty quantification. `is_incomplete` flag exists but only marks missing data, not statistical uncertainty.

### Pitfall 5: Draft Pick Attribution Error
**What goes wrong:** Conflating "player was good" with "you drafted well" (ignoring positional scarcity and ADP)
**Why it happens:** Not comparing to replacement-level or opportunity cost at draft position
**How to avoid:** Replacement-level baseline for draft picks; Shapley value measures marginal value vs. alternatives
**Warning signs:** Every draft pick shows positive impact (tautology—OF COURSE rostered players > empty roster)

**Current implementation status:** Draft picks are treated as "gained player, no lost player" (line 495-501), which makes all draft picks show positive impact. Missing: comparison to replacement level or ADP-based expectation.

### Pitfall 6: Temporal Dependency Blindness
**What goes wrong:** Treating all moves as independent when later moves respond to earlier ones (e.g., fixing category hole created by trade)
**Why it happens:** Counterfactual assumes "move didn't happen but all later moves still did"—but later moves might not have happened
**How to avoid:** Shapley values naturally handle this via averaging over orderings; alternatively, sequential counterfactuals
**Warning signs:** Dropping closer shows positive impact because you later traded for saves (circular logic)

**Current implementation status:** Current approach treats moves as independent. Shapley values would address this.

## Code Examples

### Example 1: Shapley Value Move Impact (NOT YET IMPLEMENTED)

```typescript
/**
 * Compute Shapley value for a roster move using Monte Carlo sampling.
 *
 * Shapley value = average marginal contribution across all possible move orderings
 *
 * Property: Σ Shapley(move_i) = Net Roster Value
 */
async function computeShapleyMoveImpact(
  leagueId: number,
  teamId: number,
  targetMove: RosterMove,
  allMoves: RosterMove[],
  categories: CategoryConfig[],
  numTeams: number,
  numSamples: number = 1000
): Promise<number> {
  let totalMarginalContribution = 0;

  for (let i = 0; i < numSamples; i++) {
    // Random permutation of all moves
    const ordering = shuffle([...allMoves]);
    const targetIndex = ordering.findIndex(m => m.id === targetMove.id);

    // Coalition S = moves before target in this ordering
    const coalitionMoves = ordering.slice(0, targetIndex);

    // Compute team roto points with coalition S
    const componentsWithoutMove = await computeTeamComponentsWithMoves(
      leagueId, teamId, coalitionMoves
    );
    const pointsWithout = computeRotoPoints(componentsWithoutMove, categories, numTeams);

    // Compute team roto points with coalition S ∪ {target}
    const componentsWithMove = await computeTeamComponentsWithMoves(
      leagueId, teamId, coalitionMoves.concat(targetMove)
    );
    const pointsWith = computeRotoPoints(componentsWithMove, categories, numTeams);

    // Marginal contribution for this ordering
    totalMarginalContribution += (pointsWith - pointsWithout);
  }

  // Average marginal contribution across sampled orderings
  return totalMarginalContribution / numSamples;
}

// Helper: Compute team components given a set of moves
async function computeTeamComponentsWithMoves(
  leagueId: number,
  teamId: number,
  moves: RosterMove[]
): Promise<Record<string, number>> {
  // Start with draft-only roster
  const draftPicks = moves.filter(m => m.move_type === 'draft');
  const components: Record<string, number> = {};

  // Add contributions from draft picks
  for (const pick of draftPicks) {
    const contribution = await sumPlayerContribution(
      leagueId, pick.player_id, teamId, pick.effective_date, seasonEnd
    );
    addComponents(components, contribution);
  }

  // Apply add/drop moves in chronological order
  const addDrops = moves.filter(m => m.move_type !== 'draft')
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  for (const move of addDrops) {
    if (move.move_type === 'add' || move.move_type === 'trade_in') {
      const contribution = await sumPlayerContribution(
        leagueId, move.player_id, teamId, move.effective_date, seasonEnd
      );
      addComponents(components, contribution);
    }
    // Note: drops are handled implicitly (don't add their contribution)
  }

  return components;
}
```

**Source:** Shapley value methodology from [Interpretable ML Book](https://christophm.github.io/interpretable-ml-book/shapley.html)

### Example 2: SGP Category Impact (PATTERN TO ADOPT)

```typescript
/**
 * Convert category impact to Standings Gain Points.
 *
 * SGP normalizes heterogeneous categories to common scale:
 * - Counting stats: playerValue / sgpFactor
 * - Rate stats: weighted impact / sgpFactor
 */
interface SGPFactors {
  [categoryId: string]: number; // How much stat moves you up 1 standings point
}

function computeSGPFactors(
  leagueId: number,
  snapshotDate: string,
  categories: CategoryConfig[]
): SGPFactors {
  const factors: SGPFactors = {};

  for (const cat of categories) {
    // Get all team values for this category, sorted by rank
    const teamValues = getTeamCategoryValues(leagueId, snapshotDate, cat.statKey)
      .sort((a, b) => cat.direction === 'HIGHER_BETTER' ? b - a : a - b);

    if (cat.type === 'COUNTING') {
      // SGP = average gap between adjacent standings positions
      const gaps = teamValues.slice(0, -1).map((v, i) => Math.abs(v - teamValues[i + 1]));
      factors[cat.statKey] = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    } else {
      // Rate stats need weighted calculation (AB, IP denominators)
      // Simplified: use standard deviation as proxy
      const mean = teamValues.reduce((a, b) => a + b, 0) / teamValues.length;
      const variance = teamValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / teamValues.length;
      factors[cat.statKey] = Math.sqrt(variance);
    }
  }

  return factors;
}

function convertImpactToSGP(
  actualValue: number,
  counterfactualValue: number,
  category: CategoryConfig,
  sgpFactor: number
): number {
  const delta = actualValue - counterfactualValue;

  if (category.type === 'COUNTING') {
    return delta / sgpFactor;
  } else {
    // Rate stats: delta already accounts for weighting
    return delta / sgpFactor;
  }
}
```

**Source:** SGP methodology from [Smart Fantasy Baseball](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/)

### Example 3: Replacement-Level Baseline (PATTERN TO ADOPT)

```typescript
/**
 * Compute replacement-level production for a position/period.
 *
 * Replacement level = production of freely available players (last rostered + bench)
 * Used for draft pick valuation and counterfactuals for dropped players who left league.
 */
async function computeReplacementLevelBaseline(
  leagueId: number,
  position: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, number>> {
  // Identify replacement-level players
  // In 12-team league with 2 catchers/team: 24 catchers rostered
  // Replacement level = 25th-28th best catchers (waiver wire)

  const leagueSettings = await getLeagueSettings(leagueId);
  const numTeams = leagueSettings.num_teams;
  const rostersPerPosition = leagueSettings.roster_slots[position] || 1;
  const replacementRank = numTeams * rostersPerPosition + 1; // First unrostered player

  // Get all players at position, sorted by production
  const allPlayers = await getPlayersByPosition(leagueId, position, fromDate, toDate);

  // Average production of replacement-level players (ranks N+1 through N+4)
  const replacementPlayers = allPlayers.slice(replacementRank, replacementRank + 4);

  const avgComponents: Record<string, number> = {};
  for (const player of replacementPlayers) {
    const contribution = await sumPlayerContribution(
      leagueId, player.id, player.team_id, fromDate, toDate
    );
    addComponents(avgComponents, contribution);
  }

  // Average across replacement players
  for (const key in avgComponents) {
    avgComponents[key] /= replacementPlayers.length;
  }

  return avgComponents;
}
```

**Source:** Replacement level methodology from [FanGraphs Sabermetrics Library](https://library.fangraphs.com/misc/war/replacement-level/)

### Example 4: Bootstrap Confidence Intervals (PATTERN TO ADOPT)

```typescript
/**
 * Compute confidence interval for move impact via bootstrap resampling.
 *
 * Bootstrap: resample player period stats with replacement, recompute impact, report percentiles.
 * Useful for communicating uncertainty (early-season moves, injured players).
 */
async function bootstrapMoveImpactCI(
  leagueId: number,
  teamId: number,
  move: RosterMove,
  numBootstraps: number = 1000
): Promise<{
  impact: number;
  ci_low: number;
  ci_high: number;
  is_uncertain: boolean;
}> {
  const impacts: number[] = [];

  // Get original player period stats for this move's timeframe
  const originalStats = await getPlayerPeriodStats(
    leagueId, move.player_id, move.effective_date, seasonEnd
  );

  for (let i = 0; i < numBootstraps; i++) {
    // Resample period stats with replacement
    const resampledStats = [];
    for (let j = 0; j < originalStats.length; j++) {
      const randomIndex = Math.floor(Math.random() * originalStats.length);
      resampledStats.push(originalStats[randomIndex]);
    }

    // Recompute move impact with resampled data
    const impact = await computeMoveImpactWithStats(move, resampledStats);
    impacts.push(impact);
  }

  // Sort and extract percentiles
  impacts.sort((a, b) => a - b);
  const ci_low = impacts[Math.floor(numBootstraps * 0.025)]; // 2.5th percentile
  const ci_high = impacts[Math.floor(numBootstraps * 0.975)]; // 97.5th percentile
  const impact = impacts[Math.floor(numBootstraps * 0.5)]; // Median

  // Flag as uncertain if CI crosses zero
  const is_uncertain = (ci_low < 0 && ci_high > 0) ||
                       (ci_high - ci_low) > Math.abs(impact);

  return { impact, ci_low, ci_high, is_uncertain };
}
```

**Source:** Bootstrap methodology from [Box Score Geeks - Confidence Intervals](https://www.boxscoregeeks.com/articles/confidence-intervals-and-you)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linear value aggregation | Shapley value decomposition | ~2010s (ML interpretability) | Solves additivity problem; widely adopted in sports analytics |
| Single counterfactual only | Shapley + net roster value | Emerging (2020s) | Best of both: interpretable decomposition + guaranteed correctness |
| Ignore uncertainty | Bootstrap confidence intervals | ~2000s (resampling methods) | Communicates statistical certainty to users |
| Arbitrary replacement level | Position-specific percentile | WAR standardization (2010s) | Accounts for position scarcity |
| Direct delta for rate stats | SGP weighting | Fantasy baseball standard (2000s) | Handles nonlinear rank effects |

**Deprecated/outdated:**
- **Simple per-move deltas without Shapley:** Violates additivity; move impacts don't sum to total
- **Using Z-scores instead of SGP:** Z-scores ignore replacement level and position scarcity
- **Linear regression for impact attribution:** Assumes independence; fails with correlated moves
- **Ignoring temporal effects:** Early-season moves have more uncertainty than late-season moves

## Open Questions

1. **Shapley Sampling Strategy**
   - What we know: Exact Shapley requires 2^n computations (exponential); Monte Carlo sampling is standard approximation
   - What's unclear: How many samples needed for convergence in fantasy context? (1000? 10000?)
   - Recommendation: Start with 1000 samples; add convergence check (variance of estimates)

2. **Replacement Level for Multi-Position Eligibility**
   - What we know: Replacement level varies by position (catcher << outfielder)
   - What's unclear: How to handle multi-eligible players (1B/OF, SP/RP)?
   - Recommendation: Use primary position (most games started) or position providing highest replacement-level value

3. **Rate Stat Impact with Small Samples**
   - What we know: Early-season rate stats have high variance; SGP factors change throughout season
   - What's unclear: Should we use season-end SGP factors retroactively, or period-specific factors?
   - Recommendation: Use season-end factors (reflects actual final impact) but flag early-season uncertainty

4. **Move Interaction Detection**
   - What we know: Some moves are complementary (trading for saves after dropping closer), others substitute
   - What's unclear: Can we detect and visualize these interactions beyond Shapley averaging?
   - Recommendation: Shapley values implicitly handle this; explicit interaction terms require advanced causal graphs

5. **User Communication of Uncertainty**
   - What we know: Bootstrap provides confidence intervals; users may not understand statistical concepts
   - What's unclear: Best way to show "this impact is uncertain" in UI?
   - Recommendation: Visual indicators (confidence bars), qualitative labels ("High confidence", "Low confidence"), tooltips with explanation

## Sources

### Primary (HIGH confidence)

- [FanGraphs WAR Methodology](https://library.fangraphs.com/misc/war/) - Replacement level definition, value aggregation
- [FanGraphs WPA Methodology](https://library.fangraphs.com/misc/wpa/) - Context-dependent value, additivity property
- [Smart Fantasy Baseball: SGP Guide](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/) - SGP calculation for counting and rate stats
- [Shapley Values: Interpretable ML Book](https://christophm.github.io/interpretable-ml-book/shapley.html) - Efficiency/additivity property, computational complexity

### Secondary (MEDIUM confidence)

- [Causal Inference Based on Counterfactuals (BMC)](https://link.springer.com/article/10.1186/1471-2288-5-28) - Rubin framework for causal inference
- [Google CausalImpact R Package](https://google.github.io/CausalImpact/CausalImpact.html) - Bayesian structural time-series for counterfactuals
- [Measuring Players' Importance Using Shapley Value (ResearchGate)](https://www.researchgate.net/publication/359935727_Measuring_players'_importance_in_basketball_using_the_generalized_Shapley_value) - Shapley in sports context
- [Operations Research in Fantasy Sports (JETIR)](https://www.jetir.org/papers/JETIR1907N95.pdf) - Academic overview of fantasy sports optimization

### Tertiary (LOW confidence - needs verification)

- Web search results on fantasy baseball trade analyzers - Commercial implementations (methodologies not fully disclosed)
- Rolling window time series methods - General time series literature, not fantasy-specific
- Bootstrap confidence intervals in sports - General statistical methodology

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Shapley values, SGP, counterfactual analysis are well-established with proven properties
- Architecture: HIGH - Patterns verified through academic literature (Shapley efficiency, SGP methodology)
- Pitfalls: HIGH - Additivity problem, rate stat nonlinearity, and temporal effects are documented challenges

**Research date:** 2026-02-22
**Valid until:** 60 days (methodology stable; specific implementations may evolve)

**Key Statistical Findings:**

1. **Additivity Problem is REAL:** Current per-move impacts double-count because each counterfactual assumes "all other moves still happened." This is a fundamental property of overlapping contributions, not an implementation bug.

2. **Shapley Values are the SOLUTION:** Efficiency property guarantees Σ Shapley(move_i) = Net Roster Value. This is the only method with proven additivity.

3. **SGP is REQUIRED for Rate Stats:** Roto categories are rank-based and nonlinear. Linear approximations fail. SGP weighting is the fantasy baseball standard.

4. **Replacement Level MATTERS for Draft Picks:** Current approach shows all draft picks as positive (tautology). Need replacement-level baseline to measure drafting skill vs. availability.

5. **Uncertainty SHOULD BE QUANTIFIED:** Bootstrap confidence intervals are standard for non-normal distributions. Early-season moves and injured players have wide CIs—flag them.

**Current Implementation Evaluation:**

✅ **What's Good:**
- `computeNetRosterValue` correctly avoids double-counting with single counterfactual
- Rate stats recomputed from components (not averaged)
- Full league re-ranking for counterfactual scenarios

❌ **What Needs Improvement:**
- `computeImpacts` per-move deltas don't sum to net value (additivity problem)
- No Shapley value implementation
- No uncertainty quantification (bootstrap CI)
- Draft picks lack replacement-level comparison
- No SGP-based category impact normalization
- Missing temporal weighting (all moves treated equally)

**Recommendation for Planner:**
Implement Shapley values for per-move attribution, SGP for category normalization, and bootstrap CI for uncertainty. Keep `computeNetRosterValue` as the authoritative single metric; use Shapley to decompose it into per-move contributions that correctly sum to the net value.

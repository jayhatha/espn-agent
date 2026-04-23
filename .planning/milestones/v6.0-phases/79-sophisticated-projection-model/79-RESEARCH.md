# Phase 79: Sophisticated Projection Model - Research

**Researched:** 2026-03-30
**Domain:** Fantasy baseball projection allocation, lineup optimization, GS cap enforcement
**Confidence:** HIGH

## Summary

The current StandingsProjectionAgent sums ALL rostered players' full rest-of-season (RoS) projections equally -- starters, bench, IL -- with no consideration of roster slot constraints, the 200 GS cap, or projection staleness. This produces projections that are systematically too high: a team with 15 hitters gets credit for all 15 producing simultaneously, even though only ~10 start on any given day. Similarly, SP projections are added wholesale even when the team will hit the 200 GS cap before the season ends.

Phase 79 replaces this naive summation with a sophisticated allocation model that answers: "Given this team's roster constraints, position eligibilities, and GS cap, what are the realistic projected final-season totals?" The model must also be reusable for trade/waiver simulation, where swapping players changes allocation.

**Primary recommendation:** Build a standalone `ProjectionAllocator` module (not a new agent class) that takes a roster + projections + settings and returns allocated stat components. StandingsProjectionAgent, WaiverRecommendationAgent, and TradeRecommendationAgent all call this module instead of doing their own naive summation.

## Project Constraints (from CLAUDE.md)

- **Backend:** Fastify 4, TypeScript, Kysely (PostgreSQL), BullMQ (Redis)
- **Agent pattern:** Isolated class, accepts Kysely `db` + optional Pino `logger`, single clear responsibility, mark outputs as degraded when data incomplete
- **Rate stats:** Always use component-based math from `packages/shared/src/formulas.ts` -- never average rates directly
- **Empty array guard:** Always check `array.length > 0` before using `.where("col", "in", array)` with Kysely
- **Projections are global:** `projections_run` and `player_projection` are shared across all leagues

## Standard Stack

### Core (Already in project -- no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | existing | Database queries for roster/projection data | Already used everywhere |
| shared/formulas.ts | existing | combineComponents, calculateFinalRate | Rate stat math is already correct and tested |

### Supporting (No new dependencies needed)
| Library | Purpose | Why Not Needed |
|---------|---------|----------------|
| munkres-js / munkres-algorithm | Hungarian algorithm for optimal assignment | OVERKILL -- see Architecture Patterns below |

**No new npm packages required.** The lineup allocation problem in fantasy baseball is NOT a classic assignment problem because:
1. Roster slots have different eligibility rules (MI = 2B or SS, CI = 1B or 3B, UTIL = anyone)
2. The goal is not minimum-cost assignment but maximum total production
3. The number of players is small (~25 per team) and slots are ~20
4. A greedy heuristic with position scarcity ordering produces optimal or near-optimal results

The trade recommendation agent already implements a greedy slot assignment algorithm in `validateRosterSlots()` (lines 190-233 of trade-recommendation.ts) with `canFillSlot()` helper. **Reuse and extend this pattern.**

## Architecture Patterns

### Recommended Module Structure
```
packages/backend/src/
  projection/
    allocator.ts          # ProjectionAllocator -- core allocation logic
    hitter-allocation.ts  # Hitter lineup slot assignment
    pitcher-scaling.ts    # GS cap enforcement and SP scaling
    staleness.ts          # Projection staleness prorating
    types.ts              # AllocationResult, AllocationInput types
    __tests__/
      allocator.test.ts
      hitter-allocation.test.ts
      pitcher-scaling.test.ts
      staleness.test.ts
```

### Pattern 1: Greedy Hitter Lineup Allocation

**What:** Assign hitter projections to starting lineup slots using a greedy algorithm that fills most-constrained slots first, then flex slots, then bench.

**When to use:** Every time projected stats are computed for a team (daily snapshots, trade simulation, waiver simulation).

**Algorithm:**
```typescript
// Source: Derived from trade-recommendation.ts canFillSlot() pattern

interface RosteredPlayer {
  playerId: number;
  positions: string[];        // e.g., ["SS", "2B"]
  rosterStatus: RosterStatus; // "active" | "bench" | "il"
  rosterSlot: string | null;  // Current ESPN slot assignment
  projectedComponents: StatComponents | null;
}

interface SlotAssignment {
  playerId: number;
  slot: string;              // "C", "1B", "SS", "MI", "UTIL", "BE", etc.
  contributionWeight: number; // 1.0 for starters, 0.0 for bench/IL
}

/**
 * Greedy slot assignment: fill most-constrained slots first.
 *
 * Slot processing order:
 *   Tier 1 (specific):  C, 1B, 2B, 3B, SS, OF, LF, CF, RF, SP, RP
 *   Tier 2 (flex):      MI, CI, P, DH
 *   Tier 3 (universal): UTIL
 *   Tier 4 (overflow):  BE, IL
 *
 * Within each slot, pick the eligible player with the HIGHEST
 * projected value who hasn't been assigned yet.
 * Value = simple heuristic (sum of key counting stats for the
 * player's type: HR+RBI+R+SB+OPS*AB for hitters, K+W+SV for pitchers).
 */
function allocateLineup(
  players: RosteredPlayer[],
  rosterSlots: Record<string, number>,  // e.g., { C: 1, "1B": 1, OF: 3, UTIL: 1, BE: 3 }
): SlotAssignment[] {
  // 1. Score each player
  // 2. Process slots in tier order
  // 3. For each slot, greedily assign best unassigned eligible player
  // 4. Players assigned to starting slots get weight 1.0
  // 5. Players in BE/IL get weight 0.0
  // 6. Return assignments
}
```

**Key insight:** The existing `canFillSlot()` logic in trade-recommendation.ts handles all ESPN position eligibility rules correctly (MI = 2B|SS, CI = 1B|3B, P = SP|RP, UTIL = anyone). Extract and reuse this exact logic.

**Why greedy is sufficient:** With ~25 players and ~20 slots, the greedy approach with scarcity-ordered slots produces the same result as Hungarian/optimal assignment in virtually all cases. The only scenario where it could differ is when a multi-eligible player (e.g., SS/2B) is greedily assigned to one slot, preventing a single-eligible player from being placed. Mitigated by processing most-constrained slots first.

### Pattern 2: GS Cap-Aware Pitcher Scaling

**What:** Scale SP rest-of-season projections down when the team's projected GS would exceed the 200 cap.

**Algorithm:**
```typescript
/**
 * GS cap scaling for starting pitchers.
 *
 * Inputs:
 *   - gsUsed: GS already consumed this season (from GsPacingAgent)
 *   - gsCap: League's GS limit (default 200)
 *   - assignedSPs: List of SP players assigned to starting slots
 *     Each has: projectedIP, projectedGS (from FanGraphs CSV)
 *   - seasonProgressFraction: fraction of season elapsed (0.0 to 1.0)
 *
 * Logic:
 *   1. Compute gsRemaining = gsCap - gsUsed
 *   2. Compute projectedRemainingGS = sum of each SP's projected GS,
 *      prorated by staleness factor
 *   3. If projectedRemainingGS <= gsRemaining: no scaling needed
 *   4. If projectedRemainingGS > gsRemaining:
 *      scaleFactor = gsRemaining / projectedRemainingGS
 *      Scale each SP's counting components (IP, ER, HA, BBA, K, W, etc.)
 *      by scaleFactor
 *
 * RP projections are NEVER scaled by GS cap -- they contribute
 * regardless of GS limits (confirmed by ESPN support docs).
 */
function applyGsCap(
  gsUsed: number,
  gsCap: number,
  spProjections: Array<{ playerId: number; components: StatComponents; projectedGS: number }>,
): Array<{ playerId: number; scaledComponents: StatComponents }> {
  const gsRemaining = Math.max(0, gsCap - gsUsed);
  const totalProjectedGS = spProjections.reduce((sum, sp) => sum + sp.projectedGS, 0);

  if (totalProjectedGS <= gsRemaining) {
    return spProjections.map(sp => ({ playerId: sp.playerId, scaledComponents: sp.components }));
  }

  const scaleFactor = gsRemaining / totalProjectedGS;
  return spProjections.map(sp => ({
    playerId: sp.playerId,
    scaledComponents: scaleComponents(sp.components, scaleFactor),
  }));
}

function scaleComponents(components: StatComponents, factor: number): StatComponents {
  const scaled: StatComponents = {};
  for (const [key, value] of Object.entries(components)) {
    if (typeof value === 'number') {
      scaled[key] = value * factor;
    }
  }
  return scaled;
}
```

**Critical detail from ESPN:** "If your team reaches the weekly limit during a given day's games, all pitchers who started that day will still receive full credit." This means a team can slightly exceed 200 GS. For projection purposes, treat the cap as hard at 200.

### Pattern 3: Staleness Prorating

**What:** Scale down FanGraphs RoS projections based on how many days have elapsed since the projection was published. A RoS projection published on April 1 predicts output for the remaining ~160 games. If it's now June 1, about 55 games have been played, so only ~105 games of output remain -- but the projection still claims ~160 games worth. Prorate by the fraction of remaining season.

**Algorithm:**
```typescript
/**
 * Staleness prorating formula.
 *
 * FanGraphs Depth Charts RoS projections represent the FULL rest-of-season
 * from the as_of_date. If we're N days past as_of_date, those projections
 * overstate remaining output.
 *
 * prorateFactor = remainingDaysFromToday / remainingDaysFromAsOfDate
 *
 * Where:
 *   seasonEndDate = September 28 (typical MLB regular season end)
 *   remainingDaysFromAsOfDate = seasonEndDate - asOfDate
 *   remainingDaysFromToday = seasonEndDate - today
 *   prorateFactor = max(0, remainingDaysFromToday / remainingDaysFromAsOfDate)
 *
 * Special cases:
 *   - If today == asOfDate: factor = 1.0 (no prorating)
 *   - If today > seasonEndDate: factor = 0.0 (season over)
 *   - If asOfDate is in the future: factor = 1.0 (not stale)
 */
function computeProrateFactor(
  asOfDate: string,  // projections_run.as_of_date
  today: string,     // snapshot date
  seasonEndDate: string = '2026-09-28',
): number {
  const asOf = new Date(asOfDate);
  const now = new Date(today);
  const end = new Date(seasonEndDate);

  const remainingFromAsOf = Math.max(0, (end.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24));
  const remainingFromToday = Math.max(0, (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (remainingFromAsOf <= 0) return 0;

  return Math.min(1.0, remainingFromToday / remainingFromAsOf);
}
```

**Why days-based not games-based:** FanGraphs RoS projections bake in a playing-time model. If FanGraphs says a batter will have 300 remaining AB over the rest of the season, we don't need to decompose "what fraction of games remain" -- we just need to know what fraction of the projection window has elapsed. Days is the simplest proxy and avoids needing real-time MLB game counts.

### Pattern 4: Roster Gap Detection for Trade/Waiver Simulation

**What:** After simulating a trade or waiver move, re-run lineup allocation. If a required starting slot cannot be filled, flag it.

**Algorithm:**
```typescript
interface RosterGap {
  slot: string;       // e.g., "SS"
  severity: 'empty' | 'degraded';  // empty = nobody eligible, degraded = only bench-quality
  suggestion: string; // e.g., "Team needs a SS -- consider waiver pickup"
}

/**
 * Run after trade/waiver simulation:
 * 1. Build post-trade roster
 * 2. Run allocateLineup()
 * 3. If any required starting slot has 0 eligible players: gap.severity = 'empty'
 * 4. Return gaps
 */
function detectRosterGaps(
  postTradeRoster: RosteredPlayer[],
  rosterSlots: Record<string, number>,
): RosterGap[] {
  // Reuse the same greedy assignment from allocateLineup
  // Check which starting slots could not be filled
}
```

### Pattern 5: Unified Projection Pipeline

**What:** Single function that chains all allocation steps in order.

```typescript
/**
 * The full allocation pipeline. Called by:
 *   - StandingsProjectionAgent.computeTeamProjection()
 *   - WaiverRecommendationAgent.simulateSwapFromCache()
 *   - TradeRecommendationAgent.simulateTradeImpact()
 *
 * Steps:
 *   1. Prorate projections for staleness
 *   2. Allocate hitters to starting lineup slots (bench/IL get weight 0)
 *   3. Split pitchers into SP and RP based on positions
 *   4. Scale SP projections by GS cap
 *   5. RP projections added at full weight (if in active slot)
 *   6. Sum weighted components for hitters + pitchers
 *   7. Return: { allocatedComponents: Map<categoryId, StatComponents>, gaps: RosterGap[] }
 */
function allocateProjections(input: AllocationInput): AllocationResult {
  // ...
}
```

### Anti-Patterns to Avoid

- **Averaging rates across players:** Never compute team AVG by averaging each player's AVG. Always sum components (H, AB) then divide.
- **Treating all roster players equally:** The entire point of this phase is to distinguish starters from bench/IL.
- **Using the Hungarian algorithm:** It requires equal-sized cost matrix (workers = jobs), doesn't naturally handle flex slots, and the greedy approach is fast and correct enough.
- **Hard-coding roster slot definitions:** Read from `league_settings_version.settings_json.roster_slots` -- different leagues have different slot configurations.
- **Scaling RP by GS cap:** RP contributions are never limited by GS cap. Only SP games started count.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Position eligibility rules | Custom slot-to-position mapping | `canFillSlot()` from trade-recommendation.ts | Already handles MI, CI, P, UTIL, DH correctly |
| Rate stat math | Custom formula per rate stat | `combineComponents()` + `calculateFinalRate()` from shared/formulas.ts | Battle-tested, handles all 8 rate formulas |
| GS used count | Custom counting logic | `GsPacingAgent.countGsFromRosterAndStats()` | Reads from ESPN raw payload statValues[33], fallback to tenure stats |
| Season progress | Manual date arithmetic | `GsPacingAgent.getSeasonProgress()` | Already computes weeksElapsed, weeksRemaining |
| Pitcher/batter detection | Custom heuristic | `isPitcherProjection()` (IP > 0 or ER defined) | Already used in StandingsProjectionAgent, WaiverAgent, TradeAgent |

## Common Pitfalls

### Pitfall 1: Ohtani and Two-Way Players
**What goes wrong:** A player like Ohtani has BOTH batting projections (AB > 0) and pitching projections (IP > 0) in a single `player_projection` row (merged during ingest). If you categorize players as strictly batter OR pitcher, you'll miss half their value.
**Why it happens:** `isPitcherProjection()` checks `IP > 0`, but Ohtani also has `AB > 0`.
**How to avoid:** For allocation purposes, a two-way player's BATTING components contribute to batting categories and PITCHING components contribute to pitching categories. They occupy ONE roster slot (UTIL or DH typically) for hitter allocation, but their pitching output still counts. Draft-rankings.ts already handles this (line 259): "Two-way players (Ohtani) get both."
**Warning signs:** Team projected to have lower HR/RBI than expected -- Ohtani's batting stats are being dropped.

### Pitfall 2: FanGraphs GS Column Not Currently Ingested
**What goes wrong:** The GS cap enforcement requires knowing each pitcher's projected Games Started (GS). FanGraphs CSV provides this column, but `ProjectionsIngestAgent` does NOT currently parse it.
**Why it happens:** The ingest code was written for stat components needed by rate formulas (IP, ER, H, BB, K, W, SV). Playing-time fields (G, PA, GS) were not needed before.
**How to avoid:** Modify `ProjectionsIngestAgent.ingestPitchers()` to parse and store `GS` in `stat_components_json`. Similarly, parse batter `G` and `PA` for completeness (useful for staleness cross-validation). This is a prerequisite task.
**Warning signs:** All SP projections are unscaled because GS data is missing.

### Pitfall 3: Bench Players Shouldn't Get Zero Credit Always
**What goes wrong:** Setting bench weight to exactly 0.0 means a team with a strong bench appears identical to one with AAA callups on the bench. This is mostly correct for daily projection, but for trade evaluation, knowing that a bench bat exists as insurance matters.
**Why it happens:** Overcorrection from the current bug (bench = 100% credit) to the opposite extreme.
**How to avoid:** For standings projection: bench = 0.0 (correct -- bench players don't accumulate fantasy stats). For trade/waiver gap detection: acknowledge bench players exist and can be slotted in if a starter is traded. The allocation function handles this naturally because it assigns starting slots first, then bench.
**Warning signs:** Trade simulator says "empty SS slot" when the team has a SS-eligible player on the bench.

### Pitfall 4: Double-Counting Pitcher Stats in Rate Categories
**What goes wrong:** A pitcher's H, BB stats inflate batter WHIP, or batter H inflates pitcher ERA denominator.
**Why it happens:** StandingsProjectionAgent already has `PITCHING_STAT_KEYS` and `isPitcherProjection()` filters. If the allocator doesn't maintain this separation, cross-contamination occurs.
**How to avoid:** The allocator returns SEPARATE components for hitters and pitchers: `{ batterComponents: StatComponents, pitcherComponents: StatComponents }`. Category-specific summation happens downstream, using the existing `PITCHING_STAT_KEYS` check. The allocator uses pitcher-specific keys (HA, BBA) vs batter keys (H, BB) as already established in the codebase.
**Warning signs:** Team projected ERA is dramatically lower than expected, or WHIP is inflated by counting batter BB.

### Pitfall 5: Staleness Prorating Applied After GS Cap
**What goes wrong:** If you prorate projections first (reducing IP/GS by 30%), then check GS cap, the cap check sees fewer projected GS and doesn't scale. But the team was already on pace to exceed 200 GS from the original projection.
**Why it happens:** Order of operations matters.
**How to avoid:** Prorate FIRST, then check GS cap against prorated values. This is correct because prorated GS represents the realistic remaining starts, and the cap should be checked against that realistic number.
**Warning signs:** Team with 180 GS used in September shows no scaling despite only having 20 GS remaining and 8 rostered SPs.

### Pitfall 6: Empty Roster After Trade Simulation
**What goes wrong:** When simulating a trade, if the `allocateLineup` receives a modified roster but the player projections map still references old player IDs, allocation silently produces zero stats.
**Why it happens:** Trade simulation swaps player IDs in the roster but forgets to include the incoming player's projections.
**How to avoid:** The `AllocationInput` must include a complete `projectionsByPlayerId` map that contains projections for ALL players on the post-trade roster (including acquired players). Validate that every rostered player has a projection entry (or explicitly null = no projection available).
**Warning signs:** Trade simulation shows massive stat decrease in all categories.

### Pitfall 7: Season End Date Varies by Year
**What goes wrong:** Hardcoded `2026-09-28` for season end is wrong if the MLB season extends (playoffs, schedule changes).
**Why it happens:** MLB regular season end date varies slightly year to year.
**How to avoid:** Use a configurable season end date. Default to September 28 for 2026. Can be overridden per league if needed. For 2026, the regular season ends September 27.
**Warning signs:** Prorating is slightly off, producing 1-2% error in projections.

## Code Examples

### Example 1: Extracting canFillSlot from TradeRecommendationAgent

```typescript
// Source: packages/backend/src/agents/trade-recommendation.ts lines 238-261
// Extract this as a standalone utility function

export function canFillSlot(playerPositions: string[], slotType: string): boolean {
  // UTIL, BN, IL, DH accept any position
  if (slotType === "UTIL" || slotType === "BN" || slotType === "IL" || slotType === "DH") {
    return true;
  }
  // P slot accepts SP or RP
  if (slotType === "P") {
    return playerPositions.some((pos) => pos === "SP" || pos === "RP");
  }
  // MI (middle infield) accepts 2B or SS
  if (slotType === "MI") {
    return playerPositions.some((pos) => pos === "2B" || pos === "SS");
  }
  // CI (corner infield) accepts 1B or 3B
  if (slotType === "CI") {
    return playerPositions.some((pos) => pos === "1B" || pos === "3B");
  }
  // OF slot accepts LF, CF, RF, and OF
  if (slotType === "OF") {
    return playerPositions.some((pos) => pos === "OF" || pos === "LF" || pos === "CF" || pos === "RF");
  }
  // Specific slots require exact position match
  return playerPositions.includes(slotType);
}
```

### Example 2: Adding GS to Pitcher Ingest

```typescript
// In ProjectionsIngestAgent.ingestPitchers(), add to components object:
const components: StatComponents = {
  IP: parseFloat(row.IP as string) || 0,
  ER: parseFloat(row.ER as string) || 0,
  HA: parseFloat(row.H as string) || 0,
  BBA: parseFloat(row.BB as string) || 0,
  K: strikeouts,
  SO: strikeouts,
  W: parseFloat(row.W as string) || 0,
  SV: parseFloat(row.SV as string) || 0,
  HLD: parseFloat((row.HLD as string) || "0") || 0,
  QS: parseFloat((row.QS as string) || "0") || 0,
  // NEW: Playing time fields for allocation model
  G: parseFloat(row.G as string) || 0,    // Total games
  GS: parseFloat(row.GS as string) || 0,  // Games started (critical for GS cap)
};
```

### Example 3: Adding G and PA to Batter Ingest

```typescript
// In ProjectionsIngestAgent.ingestBatters(), add to components object:
const components: StatComponents = {
  AB: parseFloat(row.AB as string) || 0,
  H: hits,
  // ... existing fields ...
  // NEW: Playing time fields
  G: parseFloat(row.G as string) || 0,    // Total games
  PA: parseFloat(row.PA as string) || 0,  // Plate appearances
};
```

### Example 4: Using combineComponents for Allocated Stats

```typescript
// After allocation, sum only starter components
import { combineComponents, calculateFinalRate } from '../../../shared/dist/index.js';

const starterComponents: StatComponents = {};
for (const assignment of assignments) {
  if (assignment.contributionWeight > 0) {
    const playerProj = projectionsByPlayerId.get(assignment.playerId);
    if (playerProj) {
      Object.assign(starterComponents, combineComponents(starterComponents, playerProj));
    }
  }
}
```

## State of the Art

| Old Approach (current) | New Approach (Phase 79) | Impact |
|------------------------|------------------------|--------|
| Sum ALL rostered players' projections | Only sum STARTING lineup + GS-capped SP | Realistic projected totals |
| Bench/IL players count 100% | Bench/IL contribute 0% to projected stats | Fixes systematic overestimation |
| No GS cap awareness | SP projections scaled to remaining GS budget | Prevents over-projecting pitching |
| No staleness prorating | RoS projections scaled by elapsed time | Prevents stale projections inflating totals |
| Trade/waiver simulation uses same naive model | Shared allocator detects roster gaps | Better trade/waiver advice |

## Open Questions

1. **Season end date source**
   - What we know: MLB 2026 regular season likely ends ~Sep 27-28
   - What's unclear: Exact date not yet published
   - Recommendation: Default to Sep 28, make configurable

2. **GS fallback when FanGraphs GS column is missing (legacy data)**
   - What we know: FanGraphs CSV has GS column, but existing projection runs lack it
   - What's unclear: How many old projection runs exist without GS
   - Recommendation: Estimate GS from IP (GS ~ IP / 6 for SP with IP > 80) as fallback when GS field is null in stat_components_json

3. **Bench player value in multi-day projection windows**
   - What we know: In a single day, only starters produce. Over a week, bench players may start some days.
   - What's unclear: Whether to model day-by-day lineup optimization
   - Recommendation: Use single-day snapshot model (weight bench = 0). Day-by-day optimization is out of scope and adds massive complexity for marginal accuracy gain in a roto (cumulative) format.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.1.1 |
| Config file | packages/backend/vitest.config.ts (or default from package.json) |
| Quick run command | `cd packages/backend && npx vitest run src/projection/ --reporter=verbose` |
| Full suite command | `cd packages/backend && npx vitest run` |

### Phase Requirements to Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Hitter lineup allocation assigns best players to starting slots | unit | `npx vitest run src/projection/__tests__/hitter-allocation.test.ts -x` | Wave 0 |
| Multi-eligible player assigned to most-constrained slot first | unit | same file | Wave 0 |
| Bench/IL players get 0 contribution weight | unit | same file | Wave 0 |
| GS cap scaling reduces SP projections proportionally | unit | `npx vitest run src/projection/__tests__/pitcher-scaling.test.ts -x` | Wave 0 |
| RP projections not affected by GS cap | unit | same file | Wave 0 |
| Staleness prorating scales by elapsed fraction | unit | `npx vitest run src/projection/__tests__/staleness.test.ts -x` | Wave 0 |
| Two-way player (Ohtani) contributes to both batting and pitching | unit | `npx vitest run src/projection/__tests__/allocator.test.ts -x` | Wave 0 |
| Trade simulation detects empty roster slot after swap | unit | same file | Wave 0 |
| FanGraphs GS and G columns parsed in pitcher ingest | unit | `npx vitest run src/agents/__tests__/projections-ingest-gs.test.ts -x` | Wave 0 |
| End-to-end: allocated projections < naive projections | integration | `npx vitest run src/projection/__tests__/allocator.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/backend && npx vitest run src/projection/ --reporter=verbose`
- **Per wave merge:** `cd packages/backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/projection/__tests__/hitter-allocation.test.ts` -- lineup allocation tests
- [ ] `src/projection/__tests__/pitcher-scaling.test.ts` -- GS cap enforcement tests
- [ ] `src/projection/__tests__/staleness.test.ts` -- prorating tests
- [ ] `src/projection/__tests__/allocator.test.ts` -- integration tests for full pipeline

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- StandingsProjectionAgent, TradeRecommendationAgent, WaiverRecommendationAgent, GsPacingAgent, ProjectionsIngestAgent (read in full)
- **FanGraphs CSV columns** -- verified from actual CSV files in repo (fangraphs-leaderboard-projections-7.csv for batters: G, PA, AB confirmed; fangraphs-leaderboard-projections-8.csv for pitchers: G, GS, IP confirmed)
- **ESPN lineup slot map** -- from espn.ts ESPN_LINEUP_SLOT_MAP (lines 212-217)
- **ESPN GS cap behavior** -- from ESPN Support: https://support.espn.com/hc/en-us/articles/360025379951-Games-Started-Pitching-Limits

### Secondary (MEDIUM confidence)
- **munkres-algorithm npm** -- verified version 1.0.2 on npm, but determined unnecessary for this use case
- **munkres-js npm** -- verified version 1.2.2 on npm, same conclusion

### Tertiary (LOW confidence)
- **MLB 2026 season end date** -- estimated Sep 27-28, needs confirmation closer to season

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all tools exist in codebase
- Architecture: HIGH -- greedy allocation well-understood, canFillSlot already battle-tested in trade agent
- Pitfalls: HIGH -- directly observed from reading current code (missing GS ingest, Ohtani handling, cross-contamination guards)
- GS cap behavior: HIGH -- confirmed from ESPN support documentation
- Staleness formula: MEDIUM -- the days-based approach is standard but could be improved with games-played data

**Research date:** 2026-03-30
**Valid until:** 2026-06-30 (stable domain, low churn)

# Phase 4: Advanced Features & Polish - Research

**Researched:** 2026-02-20
**Domain:** Lineup optimization, streaming pitchers, draft assistant (snake + auction), matchup analysis
**Confidence:** MEDIUM-HIGH

## Summary

Phase 4 adds advanced engagement features that differentiate the product from basic fantasy tools: daily lineup optimization (start/sit recommendations), streaming pitcher matchup analysis, and pre-draft tools (rankings with positional scarcity + auction valuations). Research reveals four key technical domains: (1) MLB schedule/matchup data sourcing (MLB StatsAPI provides free probable pitchers + schedules), (2) lineup optimization algorithms (constraint satisfaction with projected value maximization), (3) VBD/SGP methodologies for draft rankings (well-established formulas), and (4) auction value calculations (SGP-based dollar allocation). The codebase already has strong foundations—projection-based recommendation agents, component math formulas, and working waiver/trade systems—so Phase 4 extends these patterns rather than introducing new paradigms.

**Primary recommendation:** Build four new agents (LineupOptimizerAgent, StreamingPitcherAgent, DraftRankingsAgent, AuctionValuationAgent) following existing agent patterns. Use MLB StatsAPI for free matchup data, implement VBD/SGP calculations in shared formulas, and create frontend pages mirroring existing waiver/trade UIs. Avoid commercial APIs for v1—MLB's free data is sufficient for matchup analysis.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RECC-03 | User sees daily lineup optimization (start/sit recommendations) | Lineup optimization algorithms (constraint satisfaction), projected value maximization, roster slot mapping from league settings |
| RECC-04 | User sees streaming pitcher suggestions for favorable matchups | MLB StatsAPI probable pitchers, park factors (FanGraphs), opponent metrics, multi-start weeks detection |
| DRFT-01 | User sees pre-draft rankings with positional scarcity analysis | VBD methodology (VORP/VONA/VOLS), positional scarcity formulas, replacement level thresholds |
| DRFT-02 | User sees auction valuations based on projected stats | SGP (Standings Gain Points) methodology, budget allocation algorithms, inflation adjustments |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | 0.27.2 | Database queries | Already used for all DB access, continues for new agent data queries |
| Fastify | 4.25.2 | Backend API | Existing API routes, add new endpoints for lineup/draft features |
| Next.js 14 | 14.1.0 | Frontend | App Router pages for lineup optimizer + draft assistant |
| TanStack Query | 5.17.19 | Data fetching | Already used, continue for new frontend features |
| Recharts | 2.10.4 | Charts | Installed, use for draft value curves and lineup projections |
| date-fns | 3.0.6 | Date handling | Schedule parsing, multi-day lookahead for streaming pitchers |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | 1.6.5 | HTTP client | Already installed (ESPN adapter), use for MLB StatsAPI calls |
| pino | 8.17.2 | Logging | Agent logging consistency |

### New Dependencies (Recommended)

| Library | Version | Purpose | Why Add |
|---------|---------|---------|---------|
| None required | - | - | MLB StatsAPI is free/public, VBD/SGP formulas are mathematical (no lib needed) |

**Installation:**
```bash
# No new dependencies required for Phase 4
# All functionality can be implemented with existing stack
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MLB StatsAPI (free) | SportsDataIO (paid) | Commercial APIs cost $50-200/mo, overkill for v1. MLB StatsAPI provides schedules + probable pitchers free. |
| Custom VBD/SGP | Fantasy analytics library | No mature TypeScript library exists. VBD/SGP formulas are ~30 lines of math, hand-rolling is standard. |
| Constraint satisfaction | Linear programming lib | Lineup optimization constraints are simple (roster slots + position eligibility). No LP solver needed. |

## Architecture Patterns

### Recommended Project Structure

```
packages/backend/src/
├── agents/
│   ├── lineup-optimizer.ts           # NEW: Start/sit recommendations
│   ├── streaming-pitcher.ts          # NEW: Multi-day matchup analysis
│   ├── draft-rankings.ts             # NEW: VBD-based rankings
│   ├── auction-valuation.ts          # NEW: SGP dollar values
│   └── standings-projection.ts       # EXISTING: Reuse for baseline projections
├── adapters/
│   ├── espn.ts                       # EXISTING: Roster data
│   └── mlb-statsapi.ts               # NEW: Schedule + probable pitchers
├── api/
│   ├── lineup.ts                     # NEW: GET /api/leagues/:id/teams/:teamId/lineup/recommendations
│   ├── streaming.ts                  # NEW: GET /api/leagues/:id/streaming-pitchers
│   └── draft.ts                      # NEW: GET /api/leagues/:id/draft/{rankings,auction}
└── db/
    └── schema.ts                     # EXISTING: No new tables needed (projections + rosters sufficient)

packages/frontend/src/
├── app/leagues/[id]/
│   ├── lineup/page.tsx               # NEW: Daily lineup optimizer UI
│   ├── streaming/page.tsx            # NEW: Streaming pitcher suggestions
│   └── draft/
│       ├── rankings/page.tsx         # NEW: Snake draft rankings
│       └── auction/page.tsx          # NEW: Auction valuations
└── components/league/
    ├── LineupSlotCard.tsx            # NEW: Start/sit recommendation per slot
    ├── MatchupCard.tsx               # NEW: Pitcher vs opponent preview
    └── DraftPlayerRow.tsx            # NEW: Player with VBD/$ value
```

### Pattern 1: Agent-Based Recommendations (Existing Pattern, Extended)

**What:** Encapsulate all recommendation logic in isolated agent classes with `recommend()` method
**When to use:** All four new features (lineup, streaming, draft rankings, auction)
**Example:**

```typescript
// Source: Existing WaiverRecommendationAgent + TradeRecommendationAgent pattern
export class LineupOptimizerAgent {
  constructor(
    private db: Kysely<Database>,
    private standingsAgent: StandingsProjectionAgent,
    private logger?: Logger,
  ) {}

  /**
   * Generate start/sit recommendations for all roster slots
   */
  async getRecommendations(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    options?: {
      lookaheadDays?: number; // Default: 1 (today only)
      optimizeFor?: "overall" | "category"; // Default: overall
    }
  ): Promise<LineupRecommendation[]> {
    // 1. Get current roster + bench from team_roster_snapshot
    // 2. Get projections for all rostered players (player_projection)
    // 3. For each active roster slot (from league_settings_version):
    //    - Find eligible players (position matching)
    //    - Rank by projected value (rate * playing time probability)
    //    - If benched player > active player, recommend swap
    // 4. Return recommendations with delta projections
  }
}
```

### Pattern 2: MLB StatsAPI Integration (New Adapter)

**What:** Fetch schedule + probable pitchers from MLB's free API
**When to use:** Streaming pitcher matchups, lineup playing time estimation
**Example:**

```typescript
// Source: MLB StatsAPI docs + existing ESPN adapter retry pattern
export class MLBStatsAPIAdapter {
  private axios: AxiosInstance;

  constructor(private logger?: Logger) {
    this.axios = createRetryableAxios({
      baseURL: "https://statsapi.mlb.com/api/v1",
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
    });
  }

  /**
   * Get schedule for date range
   */
  async getSchedule(params: {
    startDate: string; // YYYY-MM-DD
    endDate: string;
    sportId?: number; // 1 = MLB
  }): Promise<MLBGame[]> {
    const { data } = await this.axios.get("/schedule", {
      params: {
        sportId: params.sportId ?? 1,
        startDate: params.startDate,
        endDate: params.endDate,
      },
    });

    return data.dates?.flatMap((d: any) => d.games || []) || [];
  }

  /**
   * Extract probable pitchers from schedule
   */
  async getProbablePitchers(date: string): Promise<Map<number, ProbablePitcher>> {
    const schedule = await this.getSchedule({
      startDate: date,
      endDate: date,
    });

    const pitchers = new Map<number, ProbablePitcher>();

    for (const game of schedule) {
      if (game.teams?.away?.probablePitcher) {
        pitchers.set(game.teams.away.probablePitcher.id, {
          ...game.teams.away.probablePitcher,
          opponent: game.teams.home.team.name,
          parkFactor: game.venue?.id, // Join with park factor data
          gameId: game.gamePk,
        });
      }
      // Similar for home pitcher
    }

    return pitchers;
  }
}
```

### Pattern 3: VBD Calculation (Component-Based Math)

**What:** Calculate positional scarcity using VORP (Value Over Replacement Player)
**When to use:** Draft rankings agent
**Example:**

```typescript
// Source: FantasyPros VBD methodology + Smart Fantasy Baseball SGP formulas
// Add to packages/shared/src/formulas.ts

export interface VBDContext {
  leagueSettings: LeagueSettings;
  totalTeams: number;
  projections: Map<number, PlayerProjection>; // playerId -> projection
}

/**
 * Calculate VBD score for a player
 * VORP = Player Value - Replacement Level Value at Position
 */
export function calculateVBD(
  playerId: number,
  context: VBDContext,
): number {
  const projection = context.projections.get(playerId);
  if (!projection) return 0;

  // 1. Calculate player's total SGP (Standings Gain Points)
  const playerSGP = calculateTotalSGP(projection, context.leagueSettings);

  // 2. Determine replacement level (e.g., 12th-best player at position in 12-team league)
  const position = getPrimaryPosition(projection);
  const replacementSGP = getReplacementSGP(position, context);

  // 3. VBD = Player SGP - Replacement SGP
  return playerSGP - replacementSGP;
}

/**
 * Calculate Standings Gain Points (SGP) from projected stats
 * SGP measures how much 1 unit of a stat moves you in standings
 */
function calculateTotalSGP(
  projection: PlayerProjection,
  settings: LeagueSettings,
): number {
  let totalSGP = 0;

  for (const category of settings.categories) {
    // Get stat value (handle rate stats with component math)
    const statValue = category.type === "RATE"
      ? calculateFinalRate(
          category.formula_id!,
          projection.stat_components_json,
          {} // No current stats for draft projections
        )
      : projection.stat_components_json[category.stat_key] ?? 0;

    // SGP = (statValue / stdDev) / numTeams
    // stdDev calculated from all projected players at position
    const sgp = calculateCategorySGP(statValue, category, context);
    totalSGP += sgp;
  }

  return totalSGP;
}
```

### Pattern 4: Auction Dollar Values (SGP to Dollars)

**What:** Convert SGP to auction dollar values with inflation adjustment
**When to use:** Auction valuation agent
**Example:**

```typescript
// Source: FanGraphs auction calculator + Smart Fantasy Baseball dollar value guide

export interface AuctionContext {
  totalBudget: number; // Total auction dollars available (e.g., $260 per team)
  totalTeams: number;
  rosterSlots: number; // Players per team
  minBidPerPlayer: number; // Usually $1
}

/**
 * Convert VBD/SGP to auction dollar values
 */
export function calculateAuctionValue(
  playerId: number,
  vbdContext: VBDContext,
  auctionContext: AuctionContext,
): number {
  const vbd = calculateVBD(playerId, vbdContext);
  if (vbd <= 0) return auctionContext.minBidPerPlayer;

  // 1. Sum total VBD across all draftable players
  const totalVBD = sumVBDForAllPlayers(vbdContext);

  // 2. Calculate spending pool (total budget - minimum bids)
  const spendingPool =
    auctionContext.totalBudget * auctionContext.totalTeams -
    auctionContext.minBidPerPlayer * auctionContext.rosterSlots * auctionContext.totalTeams;

  // 3. Dollar value = (player VBD / total VBD) * spending pool + min bid
  const rawValue = (vbd / totalVBD) * spendingPool + auctionContext.minBidPerPlayer;

  // 4. Round to nearest dollar
  return Math.round(rawValue);
}

/**
 * Adjust for inflation as players are drafted
 */
export function adjustForInflation(
  baseValue: number,
  budgetRemaining: number,
  budgetTotal: number,
): number {
  const inflationFactor = budgetRemaining / budgetTotal;
  return Math.round(baseValue * inflationFactor);
}
```

### Anti-Patterns to Avoid

- **Fetching matchup data synchronously in recommendation calls:** Pre-fetch schedules daily and cache (Redis or DB table). Don't block recommendations on live MLB API calls.
- **Averaging rate stats instead of component math:** Always use component-based formulas from `shared/formulas.ts`. Never `AVG = (current_avg + projected_avg) / 2`.
- **Hardcoding replacement level thresholds:** Derive dynamically from league size + roster settings. 12-team league needs 12 starters per position, so replacement = 13th best.
- **Complex constraint solvers for lineup optimization:** Roster constraints are simple (position eligibility + slot count). Greedy algorithm sufficient—sort by projected value, fill slots.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MLB schedule/matchup data | Web scraper for MLB.com | MLB StatsAPI (free, official) | Scraping violates ToS, breaks frequently. StatsAPI is stable REST API. |
| Park factor database | Manual CSV maintenance | FanGraphs park factors (annual CSV) | FanGraphs updates yearly with multi-year rolling averages. Industry standard. |
| Linear programming for lineup | Custom LP solver | Greedy/heuristic algorithm | Roster constraints are simple. LP overkill for ~15 player roster optimization. |
| ADP data aggregation | Scrape multiple sites | FantasyPros API (if budget allows) OR manual CSV upload | ADP changes daily. If no API budget, let users upload CSV like projections. |

**Key insight:** MLB StatsAPI provides free, reliable schedule + probable pitcher data. Don't pay for commercial APIs or scrape sites—official APIs exist for core data needs.

## Common Pitfalls

### Pitfall 1: Probable Pitchers Change Last-Minute

**What goes wrong:** Pitcher scratched for injury/rest, lineup optimizer recommends benching hitter who now faces weaker pitcher
**Why it happens:** Probable pitchers announced 24-48h ahead but change frequently
**How to avoid:**
- Fetch probable pitchers daily at snapshot time (03:00 league timezone)
- Store in `pitcher_schedule` table with `fetched_at` timestamp
- Surface staleness in UI: "Probable pitchers as of 3am ET"
- For day-of decisions, provide "refresh matchups" button (live fetch)

**Warning signs:** User complains recommendations changed after they set lineup

### Pitfall 2: Replacement Level Varies by League Size

**What goes wrong:** 12-team league VBD rankings make no sense in 10-team league
**Why it happens:** Replacement level is `(teams * starters_per_position) + 1`—different per league size
**How to avoid:**
- Always derive replacement level from `league_settings_version` roster slots
- Store VBD calculations per league (not global)
- Recalculate on settings change (rare but possible mid-season)

**Warning signs:** Draft rankings show bench-caliber players as "must drafts"

### Pitfall 3: Auction Values Inflate as Budget Depletes

**What goes wrong:** Late-auction player worth $10 shown as $5 after half the budget spent
**Why it happens:** Remaining budget concentrated on fewer roster spots = inflation
**How to avoid:**
- Provide real-time inflation adjustment in UI: "Base value $10 → Adjusted $15 (3 spots left)"
- Allow user to mark players as "drafted" to simulate budget depletion
- Show "budget remaining" prominently

**Warning signs:** User overpays for end-of-draft players

### Pitfall 4: Multi-Position Eligibility Complicates VBD

**What goes wrong:** Player eligible at SS + 2B—which replacement level to use?
**Why it happens:** VBD requires single position, but fantasy allows multi-position
**How to avoid:**
- Calculate VBD for each eligible position, take maximum (most valuable slot)
- Show "Primary VBD Position" in UI (e.g., "Ranked as SS")
- Alternative: Calculate "best lineup fit" VBD (where does he provide most value given current roster?)

**Warning signs:** Multi-position players undervalued compared to single-position specialists

### Pitfall 5: Streaming Pitchers Requires Availability Filtering

**What goes wrong:** Recommend streaming pitcher already rostered by opponent
**Why it happens:** Forgot to filter free agents before ranking matchups
**How to avoid:**
- Always join `team_roster_snapshot` to exclude rostered players
- Show ownership % from ESPN (pctOwned) in UI
- Provide "available only" filter (default ON)

**Warning signs:** User tries to add recommended pitcher, finds him unavailable

## Code Examples

Verified patterns from research:

### MLB StatsAPI Schedule Fetch

```typescript
// Source: https://statsapi.mlb.com/api/v1/schedule endpoint docs
// GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-04-15

interface MLBGame {
  gamePk: number;
  gameDate: string; // ISO timestamp
  teams: {
    away: {
      team: { id: number; name: string };
      probablePitcher?: {
        id: number;
        fullName: string;
      };
    };
    home: {
      team: { id: number; name: string };
      probablePitcher?: {
        id: number;
        fullName: string;
      };
    };
  };
  venue: {
    id: number;
    name: string;
  };
  status: {
    detailedState: string; // "Scheduled", "In Progress", "Final"
  };
}

async function fetchSchedule(date: string): Promise<MLBGame[]> {
  const response = await axios.get("https://statsapi.mlb.com/api/v1/schedule", {
    params: { sportId: 1, date },
  });
  return response.data.dates?.[0]?.games || [];
}
```

### Lineup Optimization (Greedy Algorithm)

```typescript
// Source: DFS lineup optimizer constraint satisfaction patterns

interface RosterSlot {
  slotId: string; // "C", "1B", "OF", "UTIL", "BE"
  eligiblePositions: string[]; // ["C"] or ["OF", "LF", "CF", "RF"]
  isActive: boolean; // false for BE (bench)
}

interface PlayerCandidate {
  playerId: number;
  positions: string[]; // Eligible positions
  projectedValue: number; // Sum of SGP across categories
}

function optimizeLineup(
  roster: PlayerCandidate[],
  slots: RosterSlot[],
): Map<string, number> {
  const lineup = new Map<string, number>(); // slotId -> playerId
  const assigned = new Set<number>(); // Player IDs already slotted

  // Sort players by projected value (descending)
  const sorted = [...roster].sort((a, b) => b.projectedValue - a.projectedValue);

  // Sort slots by restrictiveness (fewer eligible positions first)
  const sortedSlots = [...slots]
    .filter(s => s.isActive) // Only active slots
    .sort((a, b) => a.eligiblePositions.length - b.eligiblePositions.length);

  // Greedy assignment: fill most restrictive slots first with best available player
  for (const slot of sortedSlots) {
    for (const player of sorted) {
      if (assigned.has(player.playerId)) continue; // Already used

      // Check eligibility
      const eligible = player.positions.some(pos =>
        slot.eligiblePositions.includes(pos)
      );

      if (eligible) {
        lineup.set(slot.slotId, player.playerId);
        assigned.add(player.playerId);
        break;
      }
    }
  }

  return lineup;
}
```

### VBD Replacement Level Calculation

```typescript
// Source: FantasyPros VBD methodology + positional scarcity formulas

function getReplacementLevel(
  position: string,
  leagueSettings: LeagueSettings,
  totalTeams: number,
): number {
  // Count how many starters at this position across all teams
  const slotsPerTeam = countPositionSlots(position, leagueSettings.roster_slots);
  const totalStarters = slotsPerTeam * totalTeams;

  // Replacement level = (total starters + 1)th best player
  // Example: 12 teams * 1 C per team = 12 starters → 13th best C is replacement
  return totalStarters + 1;
}

function countPositionSlots(position: string, rosterSlots: Record<string, number>): number {
  let count = 0;

  for (const [slot, quantity] of Object.entries(rosterSlots)) {
    // Exact match (e.g., "C" slot for "C" position)
    if (slot === position) count += quantity;

    // Utility slots (UTIL, IF, OF) count as 0.5 (shared across positions)
    if (slot === "UTIL") count += quantity * 0.2; // UTIL accessible by all
    if (slot === "IF" && ["1B", "2B", "3B", "SS"].includes(position)) {
      count += quantity * 0.25; // IF shared by 4 positions
    }
    if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(position)) {
      count += quantity * 0.33; // OF shared by ~3 positions
    }
  }

  return Math.ceil(count);
}
```

### Streaming Pitcher Scoring

```typescript
// Source: FantasyPros streaming pitcher methodology + park factor analysis

interface StreamingCandidate {
  playerId: number;
  name: string;
  opponent: string;
  opponentRank: number; // 1-30 team hitting rank (lower is weaker offense)
  parkFactor: number; // 100 = neutral, <100 = pitcher-friendly
  projectedStats: StatComponents; // IP, K, ERA, WHIP projected for this start
  compositeScore: number; // Weighted score
}

function scoreStreamingCandidate(
  candidate: StreamingCandidate,
  leagueCategories: Category[],
): number {
  let score = 0;

  // 1. Opponent strength (30 points max): weaker opponent = higher score
  score += (31 - candidate.opponentRank) * 1.0;

  // 2. Park factor (20 points max): pitcher-friendly park = higher score
  const parkBonus = Math.max(0, (100 - candidate.parkFactor) / 5); // 80 park = 4 pts
  score += parkBonus;

  // 3. Projected stats (50 points max): weighted by league categories
  for (const category of leagueCategories) {
    if (category.stat_key === "K") {
      score += (candidate.projectedStats.K ?? 0) * 2; // 2 pts per K
    }
    if (category.stat_key === "W") {
      score += (candidate.projectedStats.W ?? 0) * 10; // 10 pts per W
    }
    // ERA/WHIP: lower is better (inverse scoring)
    if (category.stat_key === "ERA") {
      const era = calculateERA(candidate.projectedStats);
      score += Math.max(0, (5.0 - era) * 5); // ERA under 5.0 scores points
    }
  }

  return score;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual CSV upload for ADP | Live ADP API feeds | 2020+ | Real-time draft value adjustments. But adds API cost. |
| Static replacement levels | Dynamic by league size | 2018+ | VBD now accurate for 8-team to 20-team leagues. |
| Single-day lineup | Multi-day lookahead | 2021+ | Streaming pitchers benefit from 2-start weeks. |
| Points-only auction | SGP-based categories | 2015+ | Auction values now reflect roto category impact. |

**Deprecated/outdated:**
- **Manual park factor tables:** FanGraphs publishes annual CSV with 3-year rolling averages. Don't maintain custom park factor DB.
- **Scraping MLB.com for schedules:** MLB StatsAPI official endpoint exists since 2018. No scraping needed.
- **Simple VORP (batting avg * AB):** Modern VBD uses SGP across all categories, not just volume stats.

## Open Questions

1. **ADP Data Sourcing for Draft Assistant**
   - What we know: FantasyPros, NFBC, RotoWire publish daily ADP. No free API found.
   - What's unclear: Should we scrape (ToS violation risk), pay for API ($50-100/mo), or let users upload CSV?
   - Recommendation: **v1 = CSV upload** (same UX as projections). Users download ADP from FantasyPros/NFBC manually. **v2 = API** if budget allows.

2. **Park Factors Update Frequency**
   - What we know: FanGraphs publishes annual park factors CSV (3-year rolling).
   - What's unclear: Do we fetch yearly (manual update) or scrape/API daily?
   - Recommendation: **Yearly manual update** in migrations (e.g., `007_park_factors_2026.sql`). Park factors stable within season.

3. **Multi-Start Week Detection Complexity**
   - What we know: Some pitchers have 2 starts in a week (huge value boost).
   - What's unclear: Does MLB StatsAPI expose team schedules 7 days ahead reliably?
   - Recommendation: **Fetch 7-day schedule daily**. Compare pitcher's team schedule count for week. Simple but effective.

4. **Lineup Optimizer Scope: Daily vs Weekly**
   - What we know: ESPN fantasy is weekly add/drop periods, but lineups set daily.
   - What's unclear: Should we optimize for single day (today) or full week (next 7 days)?
   - Recommendation: **Default = today only**. Add "weekly view" toggle in v2 if users request it.

5. **Auction Budget Tracking During Live Draft**
   - What we know: Users want real-time inflation adjustments as budget depletes.
   - What's unclear: Do we store draft state in DB (persistent) or client-side (session)?
   - Recommendation: **Client-side state** for v1 (simpler). LocalStorage + sync on page refresh. **v2 = DB persistence** for multi-device drafts.

## Sources

### Primary (HIGH confidence)

- [MLB StatsAPI Schedule Endpoint](https://statsapi.mlb.com/api/v1/schedule) - Probable pitchers, game schedules, venues
- [MLB StatsAPI Documentation](https://docs.statsapi.mlb.com/) - Official API reference
- [FantasyPros VBD Methodology](https://support.fantasypros.com/hc/en-us/articles/115005868747-What-is-value-based-drafting-What-do-player-draft-values-mean-VORP-VONA-VOLS-VBD) - VORP, VONA, VOLS definitions
- [Smart Fantasy Baseball SGP Guide](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/) - SGP calculation methodology
- [FanGraphs Auction Calculator Guide](https://fantasy.fangraphs.com/using-the-auction-calculator-in-2022-a-beginners-guide/) - Dollar value conversion from SGP

### Secondary (MEDIUM confidence)

- [SportsDataIO MLB API](https://sportsdata.io/developers/api-documentation/mlb) - Commercial alternative to MLB StatsAPI (not using, but confirms data availability)
- [FantasyPros Lineup Assistant](https://www.fantasypros.com/mlb/myplaybook/baseball-lineup-assistant.php) - Competitive feature comparison
- [Gurobi DFS Optimization](https://www.gurobi.com/resources/leveling-the-fantasy-sports-playing-field-with-optimization/) - Constraint optimization patterns (overkill for our use case)
- [FanGraphs Park Factors 2026](https://www.fangraphs.com/guts.aspx?type=pf&season=2026&teamid=0) - Annual park factor data source

### Tertiary (LOW confidence)

- [ESPN Fantasy API Endpoints](https://stmorse.github.io/journal/espn-fantasy-v3.html) - Community documentation, not official (lineup slot mappings confirmed with codebase)
- [DFS Lineup Optimizer Algorithms](https://www.dailyfantasyfuel.com/mlb/) - Commercial tools (constraint patterns inferred, not open source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, agents follow existing patterns
- Architecture: HIGH - VBD/SGP formulas well-documented, MLB StatsAPI proven reliable
- Pitfalls: MEDIUM - Common issues identified from user forums, but mitigation strategies theoretical until tested

**Research date:** 2026-02-20
**Valid until:** ~90 days (stable domain—MLB API + VBD methodologies change slowly)

# Architecture Patterns: Multi-Player Trades & Historical Analysis

**Domain:** Fantasy Baseball Trade Analysis & Season Retrospectives
**Researched:** 2026-02-20
**Confidence:** HIGH

---

## Executive Summary

This milestone extends existing TradeRecommendationAgent and adds historical backfill to enable:
1. **Multi-player trade evaluation** (2-for-2, 3-for-1, N-for-M)
2. **Season replay timeline** (visualize how trades/waivers affected standings)
3. **Trade retrospectives** ("Did this trade help me?" analysis)
4. **Historical data backfill** (fetch past scoring periods from ESPN)

**Key architectural insight:** All features leverage existing snapshot infrastructure. No new data model needed — only extensions to agents, new views on existing tables, and backfill jobs.

---

## Integration Points with Existing Architecture

### Component Modification Matrix

| Component | Status | Modification Type | Why |
|-----------|--------|------------------|-----|
| **TradeRecommendationAgent** | EXTEND | Add multi-player simulation | Currently hardcoded 1-for-1; needs N-for-M logic |
| **SnapshotOrchestratorAgent** | EXTEND | Add historical backfill mode | Currently only fetches current scoring period |
| **ESPNAdapter** | EXTEND | Add `scoringPeriodId` parameter | Adapter supports it, orchestrator doesn't use it |
| **StandingsProjectionAgent** | NO CHANGE | Use as-is | Already computes projected standings from any snapshot |
| **Database schema** | NO CHANGE | Use existing tables | All data fits current snapshot + transaction tables |
| **API routes** | NEW | Add retrospective endpoints | New routes querying existing data with time filters |
| **Frontend components** | NEW | Timeline visualizations | New components consuming existing timeseries endpoints |

**Critical insight:** 90% of needed data already exists. This is a *views and simulation* milestone, not a *data model* milestone.

---

## 1. Multi-Player Trade Evaluation Architecture

### Current State (1-for-1 Trades)

```typescript
// TradeRecommendationAgent.simulateTradeImpact (line 540-776)
// Current flow:
1. Start with projected final season totals (from team_daily_projected_category)
2. Subtract ROS projections for 1 player being traded away
3. Add ROS projections for 1 player being acquired
4. Re-rank all teams to calculate new standings
```

**Limitation:** Hardcoded to single player in `givePlayers[0]` and `receivePlayers[0]`.

### Extended Architecture (N-for-M Trades)

**No algorithm changes needed.** The existing simulation loop already iterates over `givePlayers[]` and `receivePlayers[]` arrays (lines 634-642, 644-652). The current 1-for-1 limitation is only in the `generateTradeCandidates` function (line 338-350), which constructs single-player trades.

#### Integration Changes

**1. Extend `ProposedTrade` interface** (already supports arrays):
```typescript
// packages/backend/src/agents/trade-recommendation.ts:22-30
export interface ProposedTrade {
  givePlayers: TradePlayer[];      // ✓ Already array
  receivePlayers: TradePlayer[];   // ✓ Already array
}
```

**2. Add multi-player candidate generation**:
```typescript
// NEW method in TradeRecommendationAgent
async generateMultiPlayerCandidates(
  leagueId: number,
  teamId: number,
  snapshotDate: string,
  tradeStructure: { give: number; receive: number }, // e.g., {give: 2, receive: 2}
  maxCandidates: number = 10
): Promise<TradeCandidate[]>
```

**Strategy:** Use genetic algorithm approach from research ([arXiv:2511.17535](https://www.arxiv.org/pdf/2511.17535)) to avoid combinatorial explosion:

```
For 2-for-2 trades with 15-player rosters:
- Brute force: C(15,2) × C(15,2) = 105 × 105 = 11,025 combinations
- Genetic algorithm: ~500-1000 evaluations (95% reduction)
```

**Algorithm sketch:**
```typescript
// Initial population: Random N-for-M trade combinations
// Fitness function: deltaOverallPoints from simulateTradeImpact
// Crossover: Swap players between candidate trades
// Mutation: Replace one player with random roster player
// Termination: 500 evaluations or convergence
```

**3. API endpoint extension**:
```typescript
// NEW route in packages/backend/src/api/recommendations.ts
GET /api/leagues/:id/teams/:teamId/trades/recommendations
  ?tradeSize=2x2  // "1x1", "2x2", "3x1", etc.
  &maxCandidates=10
```

#### Data Flow (Multi-Player)

```
Frontend Trade Builder
  ↓
POST /api/leagues/:id/teams/:teamId/trades/impact
  body: { givePlayers: [p1, p2], receivePlayers: [p3, p4] }
  ↓
TradeRecommendationAgent.analyzeTradeImpact(...)
  ↓
simulateTradeImpact(...) [UNCHANGED — already handles arrays]
  → Loop over givePlayers[] (subtract ROS projections)
  → Loop over receivePlayers[] (add ROS projections)
  → Re-rank teams → Calculate category impacts
  ↓
Return TradeImpactAnalysis { deltaOverallPoints, categoryImpacts }
```

**No changes to `simulateTradeImpact` method.** It already works for N-for-M trades.

#### Complexity Considerations

| Trade Size | Combinations (15-player roster) | Strategy | Est. Runtime |
|------------|--------------------------------|----------|--------------|
| 1-for-1 | 225 | Brute force (current) | ~5s |
| 2-for-2 | 11,025 | Genetic algorithm | ~15s |
| 3-for-1 | 6,825 | Genetic algorithm | ~12s |
| 3-for-3 | ~455k | Genetic + early termination | ~30s |

**Risk mitigation:**
- Cap at 3-for-3 trades (UI constraint)
- Background job for large searches (BullMQ)
- Cache candidate trades per snapshot (Redis)

---

## 2. Historical Data Backfill Architecture

### ESPN API Historical Access Pattern

**ESPN API supports historical data via `scoringPeriodId` parameter:**

```typescript
// ESPNAdapter.fetchLeague already accepts scoringPeriodId (line 24)
interface ESPNFetchOptions {
  scoringPeriodId?: number;  // ✓ Supported but unused
}
```

**Endpoint pattern:**
```
GET /seasons/2025/segments/0/leagues/123456?scoringPeriodId=42
  → Returns league state as of scoring period 42
```

**Scoring period mapping** (baseball):
- Period 0: Preseason (before games)
- Period 1-26: Weekly scoring periods (Apr-Sep)
- Period 27+: Postseason

**Data availability:** ESPN retains historical data for current + prior season ([source: GitHub discussion #525](https://github.com/cwendt94/espn-api/discussions/525)). Older seasons may be deleted by ESPN.

### Backfill Agent Architecture

**NEW: HistoricalBackfillAgent**

```typescript
// packages/backend/src/agents/historical-backfill.ts

export class HistoricalBackfillAgent {
  constructor(
    private db: Kysely<Database>,
    private espnAdapter: ESPNAdapter,
    private snapshotOrchestrator: SnapshotOrchestratorAgent,
    private logger?: Logger
  ) {}

  /**
   * Backfill historical snapshots for a league
   * Fetches ESPN data for each scoring period and runs snapshot pipeline
   */
  async backfillLeague(
    leagueId: number,
    startPeriod: number,
    endPeriod: number,
    options: { dryRun?: boolean; skipExisting?: boolean }
  ): Promise<BackfillReport>
}
```

#### Data Flow (Backfill)

```
User triggers backfill via admin UI
  ↓
POST /api/admin/leagues/:id/backfill
  body: { startDate: "2025-04-01", endDate: "2025-09-30" }
  ↓
Queue BullMQ job: historical-backfill
  ↓
HistoricalBackfillAgent.backfillLeague(...)
  ↓
For each scoring period (start → end):
  1. Determine snapshot date (Monday of scoring period)
  2. Check if snapshot exists (skipExisting: true)
  3. Fetch ESPN data with scoringPeriodId parameter
  4. Run SnapshotOrchestratorAgent (reuse existing pipeline!)
     → Archive raw payload
     → Normalize data
     → Write snapshot tables
     → Compute projections (if ROS projections available)
     → Fetch transactions (if available)
  5. Sleep 2s between requests (rate limiting)
  ↓
Return BackfillReport { processed, skipped, failed, snapshots }
```

**Key insight:** Reuse `SnapshotOrchestratorAgent.executeSnapshot()` with `forceFresh: true`. No new snapshot logic needed.

#### Projection Handling for Historical Snapshots

**Problem:** ROS projections from 2025-04-01 won't exist in 2026.

**Solution:** Mark historical snapshots as degraded:

```typescript
// SnapshotOrchestratorAgent (line 124-137)
// Already has degraded_reasons tracking!

if (!projectionsRun || projectionsRun.as_of_date !== snapshotDate) {
  isDegraded = true;
  degradedReasons.push("projections_missing");
}
```

**Historical snapshots will:**
- ✓ Have current standings (from ESPN data)
- ✓ Have transactions (from mTransactions2 view)
- ✓ Have roster snapshots
- ✗ NOT have projected standings (degraded)

**Trade retrospective will use actual results, not projections.**

#### API Endpoints (Backfill)

```typescript
// NEW routes in packages/backend/src/api/admin.ts

POST /api/admin/leagues/:id/backfill
  body: { startDate: string; endDate: string; skipExisting?: boolean }
  → Queue backfill job → Return jobId

GET /api/admin/jobs/:jobId/status
  → Return { status, progress, report }
```

---

## 3. Season Replay Timeline Architecture

### Existing Data (No Changes Needed)

All data already exists in current schema:

| Data Type | Table | Available? |
|-----------|-------|-----------|
| Daily standings | `team_daily_overall` | ✓ (from league connect date) |
| Category ranks | `team_daily_category_ranks` | ✓ |
| Roster snapshots | `team_roster_snapshot` | ✓ |
| Transactions | `league_transaction_event` | ✓ |
| Projected standings | `team_daily_projected_overall` | ✓ (if projections uploaded) |

### Timeline Visualization Strategy

**Frontend component architecture:**

```typescript
// NEW: packages/frontend/src/components/SeasonTimeline.tsx

<SeasonTimeline leagueId={123} teamId={456} />
  ↓
Fetch parallel:
  - /api/leagues/123/timeseries/overall?teamIds=456
  - /api/leagues/123/timeseries/annotations?teamIds=456
  - /api/leagues/123/timeseries/projected-overall?teamIds=456
  ↓
Merge data:
  - X-axis: snapshot_date (time)
  - Y-axis: overall_rank or overall_points
  - Annotations: transaction_event markers
  ↓
Render Recharts LineChart with:
  - Line 1: Actual standings (team_daily_overall)
  - Line 2: Projected standings (team_daily_projected_overall)
  - Annotations: Vertical lines for trades/adds/drops
```

**Existing API endpoints already support this** (packages/backend/src/api/timeseries.ts):
- ✓ `GET /api/leagues/:id/timeseries/overall` (line 20-62)
- ✓ `GET /api/leagues/:id/timeseries/annotations` (line 292-328)
- ✓ `GET /api/leagues/:id/timeseries/projected-overall` (line 109-145)

**No new backend code needed.** Only frontend visualization.

#### Enhanced Timeline Features

**NEW endpoint for trade impact correlation:**

```typescript
// NEW route in packages/backend/src/api/timeseries.ts

GET /api/leagues/:id/teams/:teamId/timeline/impact-analysis
  ?from=2025-04-01&to=2025-09-30
  ↓
For each transaction in date range:
  1. Get standings snapshot BEFORE transaction (event_date - 1 day)
  2. Get standings snapshot AFTER transaction (event_date + 7 days)
  3. Calculate delta: overall_rank, category_ranks
  4. Return { transaction, beforeRank, afterRank, deltaRank, deltaPoints }
```

**Data structure:**
```typescript
interface TransactionImpactTimeline {
  transactions: Array<{
    eventTime: Date;
    eventType: "add" | "drop" | "trade" | "waiver";
    playersAdded: number[];
    playersDropped: number[];
    beforeStandings: { rank: number; points: number };
    afterStandings: { rank: number; points: number };
    deltaRank: number;
    deltaPoints: number;
    significance: "major" | "minor" | "negligible";
  }>;
}
```

---

## 4. Trade Retrospective Architecture

### Analysis Pattern

**Question:** "Did trading Player A for Player B in Week 8 help my season?"

**Data sources:**
1. Transaction event (what was traded, when)
2. Snapshot BEFORE trade (standings, roster)
3. Snapshot AFTER trade (actual outcome)
4. Player projections AS OF trade date (expected outcome)

**Comparison:**
```
Actual path:    Standings before → Execute trade → Actual standings after
Counterfactual: Standings before → No trade      → Projected standings after
Delta:          Actual - Counterfactual = Trade impact
```

### Implementation

**NEW: TradeRetrospectiveAgent**

```typescript
// packages/backend/src/agents/trade-retrospective.ts

export class TradeRetrospectiveAgent {
  constructor(
    private db: Kysely<Database>,
    private tradeAgent: TradeRecommendationAgent,
    private logger?: Logger
  ) {}

  /**
   * Analyze actual impact of a past trade
   */
  async analyzeHistoricalTrade(
    leagueId: number,
    transactionId: number
  ): Promise<TradeRetrospectiveAnalysis>
}
```

#### Analysis Flow

```
TradeRetrospectiveAgent.analyzeHistoricalTrade(leagueId, txnId)
  ↓
1. Fetch transaction from league_transaction_event
   → Extract: event_date, team_id, counterparty_team_id, players_added, players_dropped
  ↓
2. Get snapshot BEFORE trade (event_date - 1 day)
   → team_daily_overall: beforeRank, beforePoints
   → team_roster_snapshot: rosterBefore
  ↓
3. Get snapshot AFTER trade (event_date + 14 days)
   → team_daily_overall: actualAfterRank, actualAfterPoints
  ↓
4. Simulate counterfactual (what if trade DIDN'T happen?)
   → Use TradeRecommendationAgent.simulateTradeImpact()
   → Reverse the trade: give = receivedPlayers, receive = tradedAwayPlayers
   → Expected outcome: projectedAfterRank, projectedAfterPoints
  ↓
5. Calculate impact
   → actualDelta = actualAfterPoints - beforePoints
   → expectedDelta = projectedAfterPoints - beforePoints
   → surpriseFactor = actualDelta - expectedDelta
  ↓
Return TradeRetrospectiveAnalysis {
  transaction,
  before: { rank, points },
  actual: { rank, points, delta },
  expected: { rank, points, delta },
  verdict: "helped" | "hurt" | "neutral",
  surpriseFactor,
  explanation: "Trading X for Y gained you 3.2 points vs projected 1.5"
}
```

### API Endpoints (Retrospective)

```typescript
// NEW routes in packages/backend/src/api/trades.ts

GET /api/leagues/:id/teams/:teamId/trades/history
  → List all trades for team with actual impact

GET /api/leagues/:id/teams/:teamId/trades/:transactionId/retrospective
  → Detailed analysis of one trade (actual vs expected)

GET /api/leagues/:id/teams/:teamId/trades/performance
  → Aggregate: How well did your trades perform this season?
    → { totalTrades, avgActualDelta, avgExpectedDelta, winRate }
```

---

## Build Order & Dependencies

### Recommended Phasing

**Phase 1: Multi-Player Trade Evaluation (8-12 days)**
- Extend `TradeRecommendationAgent` with genetic algorithm candidate generation
- Add API endpoints for N-for-M trade structures
- Frontend: Multi-select player picker in trade builder
- **Dependency:** None (pure extension of existing agent)

**Phase 2: Historical Backfill (5-8 days)**
- Build `HistoricalBackfillAgent`
- Add admin API endpoints + BullMQ job
- Wire `scoringPeriodId` parameter through ESPN adapter
- Frontend: Admin backfill UI with progress tracking
- **Dependency:** None (isolated from other features)

**Phase 3: Season Timeline Visualization (3-5 days)**
- Frontend: `SeasonTimeline` component using Recharts
- Add transaction impact correlation endpoint
- Frontend: Transaction annotation tooltips
- **Dependency:** Phase 2 (historical snapshots) for full timeline; works with partial data

**Phase 4: Trade Retrospective (6-10 days)**
- Build `TradeRetrospectiveAgent`
- Add retrospective API endpoints
- Frontend: Trade history view with impact cards
- **Dependency:** Phase 1 (multi-player simulation), Phase 2 (historical data), Phase 3 (timeline visualization for context)

**Total timeline:** 22-35 days (sequential). Can parallelize Phase 1 + Phase 2 to reduce to 20-28 days.

---

## Component Extension Details

### 1. ESPNAdapter Extensions

**File:** `packages/backend/src/adapters/espn.ts`

**Change:** Use existing `scoringPeriodId` parameter in backfill mode

```typescript
// Line 256: fetchLeague() already accepts scoringPeriodId
// No code changes needed — just use it in SnapshotOrchestrator
```

**Verification:**
```typescript
// Test that scoringPeriodId parameter works
const historicalData = await espnAdapter.fetchLeague({
  leagueId: 123,
  season: 2025,
  scoringPeriodId: 42, // Week 42 of 2025 season
  auth: cookies
});
// Expect: data from that specific week, not current week
```

### 2. SnapshotOrchestratorAgent Extensions

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`

**Change:** Add optional `scoringPeriodId` to `SnapshotJobOptions`

```typescript
// Line 17: Extend interface
export interface SnapshotJobOptions {
  leagueId: number;
  snapshotDate: string;
  espnAuth?: ESPNAuthCookies;
  forceFresh?: boolean;
  scoringPeriodId?: number; // NEW: For historical backfill
}

// Line 71: Pass scoringPeriodId to adapter
const espnData = await this.espnAdapter.fetchLeague({
  leagueId: league.espn_league_id,
  season: league.season,
  auth: espnAuth,
  scoringPeriodId: scoringPeriodId, // NEW
  views: ["mSettings", "mTeam", "mRoster", "mStandings", "kona_player_info"],
  // ...
});
```

**No other changes needed.** Rest of pipeline works as-is.

### 3. TradeRecommendationAgent Extensions

**File:** `packages/backend/src/agents/trade-recommendation.ts`

**New method:**
```typescript
// Add after generateTradeCandidates() (line 408)

/**
 * Generate multi-player trade candidates using genetic algorithm
 */
async generateMultiPlayerCandidates(
  leagueId: number,
  teamId: number,
  snapshotDate: string,
  tradeStructure: { give: number; receive: number },
  maxCandidates: number = 10,
  maxGenerations: number = 50
): Promise<TradeCandidate[]> {
  // Genetic algorithm implementation
  // 1. Initial population: Random N-for-M combinations
  // 2. Fitness: Call existing analyzeTradeImpact() (works for N-for-M!)
  // 3. Selection: Tournament selection (top 20%)
  // 4. Crossover: Swap players between trades
  // 5. Mutation: Replace one player (10% chance)
  // 6. Termination: maxGenerations or convergence
  // Return top candidates by fitness (deltaOverallPoints)
}
```

**Critical:** `simulateTradeImpact()` method (line 540-776) **already supports N-for-M** via loops over `givePlayers[]` and `receivePlayers[]`. No changes needed there.

---

## Data Model Impact

### Schema Changes: NONE

All features use existing tables:
- ✓ `league_daily_snapshot` (historical snapshots)
- ✓ `team_daily_overall` (standings timeline)
- ✓ `team_daily_category_ranks` (category timeline)
- ✓ `team_roster_snapshot` (roster changes)
- ✓ `league_transaction_event` (trade/waiver annotations)
- ✓ `team_daily_projected_overall` (projected timeline)

**Only addition:** Index optimization for timeline queries

```sql
-- NEW index for efficient timeline queries
CREATE INDEX idx_team_daily_overall_timeline
  ON team_daily_overall(league_id, team_id, snapshot_date);

CREATE INDEX idx_transaction_event_timeline
  ON league_transaction_event(league_id, team_id, event_date);
```

---

## Performance Considerations

### Multi-Player Trade Candidate Search

| Concern | Mitigation |
|---------|-----------|
| Combinatorial explosion | Genetic algorithm (95% reduction in evaluations) |
| Long response times | Queue as BullMQ job; return jobId; poll for results |
| Cache invalidation | Cache per (leagueId, snapshotDate, tradeStructure) → Invalidate on new snapshot |

### Historical Backfill

| Concern | Mitigation |
|---------|-----------|
| ESPN rate limits | Sleep 2s between requests; retry with exponential backoff |
| Large data volume | Process in chunks (5 periods at a time); checkpoint progress |
| Database load | Batch inserts (10 snapshots per transaction); VACUUM after backfill |

### Timeline Queries

| Concern | Mitigation |
|---------|-----------|
| Full table scan | Add composite index on (league_id, team_id, snapshot_date) |
| Large result sets | Paginate timeline (default: 30 days; max: 180 days) |
| Join overhead | Denormalize transaction metadata in annotations response |

---

## Risk Assessment

### High Risk

**ESPN historical data availability**
- Risk: ESPN may not retain data older than current season
- Mitigation: Document supported date ranges; graceful degradation if data missing
- Confidence: MEDIUM ([ESPN deletes old data per GitHub discussion](https://github.com/cwendt94/espn-api/discussions/525))

### Medium Risk

**Multi-player trade performance**
- Risk: 3-for-3 trades may timeout (>30s)
- Mitigation: Background jobs; cache results; cap at 3-for-3 max
- Confidence: HIGH (genetic algorithm tested in [arXiv paper](https://www.arxiv.org/pdf/2511.17535))

### Low Risk

**Timeline visualization accuracy**
- Risk: Snapshot gaps (missed days) create jagged charts
- Mitigation: Linear interpolation; "data missing" annotations
- Confidence: HIGH (time-series visualization is well-understood)

---

## Sources & References

**ESPN API Patterns:**
- [ESPN Fantasy API v3 Guide](https://stmorse.github.io/journal/espn-fantasy-v3.html) — scoringPeriodId usage
- [ESPN API Endpoints (GitHub Gist)](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c) — historical access patterns
- [espn-api Python library](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) — scoring period mapping
- [GitHub Discussion #525](https://github.com/cwendt94/espn-api/discussions/525) — historical data availability

**Multi-Player Trade Algorithms:**
- [Genetic Algorithm for Fantasy Football Trades (arXiv:2511.17535)](https://www.arxiv.org/pdf/2511.17535) — evolutionary approach to multi-player trade generation
- [Fantasy Football Trade Analyzer](https://www.rototrade.com/fantasy-football-trade-analyzer) — 3-team+ trade evaluation
- [KeepTradeCut Trade Calculator](https://keeptradecut.com/trade-calculator) — dynasty trade valuations

**Timeline Visualization:**
- [Yahoo Fantasy History Guide](https://help.yahoo.com/kb/SLN22671.html) — historical standings visualization
- [League Legacy ESPN Tools](https://leagulegacy.io/services/espn) — season replay features

---

**Last Updated:** 2026-02-20
**Confidence Level:** HIGH (90%)
**Next Steps:** Detailed agent implementation specs + API contract definitions

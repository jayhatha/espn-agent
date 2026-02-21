# Integration Summary: Multi-Player Trades & Historical Analysis

**Milestone:** Subsequent milestone for ESPN Fantasy Baseball Assistant
**Research Date:** 2026-02-20
**Focus:** Integration architecture for new features

---

## Quick Reference

### What Gets Modified vs. Created

| Component | Type | Complexity | Reason |
|-----------|------|-----------|--------|
| TradeRecommendationAgent | EXTEND | Medium | Add N-for-M candidate generation (genetic algorithm) |
| SnapshotOrchestratorAgent | EXTEND | Low | Add `scoringPeriodId` parameter support |
| ESPNAdapter | NO CHANGE | None | Already supports `scoringPeriodId` |
| Database schema | NO CHANGE | None | All data fits existing tables |
| HistoricalBackfillAgent | NEW | Medium | Orchestrate backfill jobs |
| TradeRetrospectiveAgent | NEW | Low | Compare actual vs. expected outcomes |
| Timeline visualization | NEW | Low | Frontend component using existing APIs |
| Admin backfill UI | NEW | Low | Trigger/monitor backfill jobs |

**Key insight:** 90% reuse of existing infrastructure. No breaking changes.

---

## Data Flow Diagrams

### 1. Multi-Player Trade Evaluation

```
User builds 2-for-2 trade in frontend
  ↓
POST /api/leagues/123/teams/456/trades/impact
  body: {
    givePlayers: [{ playerId: 1, playerName: "Player A" }, { playerId: 2, playerName: "Player B" }],
    receivePlayers: [{ playerId: 3, playerName: "Player C" }, { playerId: 4, playerName: "Player D" }]
  }
  ↓
TradeRecommendationAgent.analyzeTradeImpact(...)
  ↓
simulateTradeImpact(...) [EXISTING METHOD — NO CHANGES]
  → Loop over givePlayers[] (subtract ROS projections)
  → Loop over receivePlayers[] (add ROS projections)
  → Recalculate rate stats from components
  → Re-rank teams → Calculate category impacts
  ↓
Return { deltaOverallPoints, categoryImpacts, recommendation, explanation }
```

**Integration point:** Existing `simulateTradeImpact()` method already handles arrays. Only change: generate multi-player candidates using genetic algorithm.

---

### 2. Historical Data Backfill

```
Admin triggers backfill: "Fetch 2025 season (Week 1-26)"
  ↓
POST /api/admin/leagues/123/backfill
  body: { startDate: "2025-04-01", endDate: "2025-09-30" }
  ↓
Queue BullMQ job: historical-backfill
  ↓
HistoricalBackfillAgent.backfillLeague(...)
  ↓
For each scoring period (1-26):
  1. Calculate scoring period ID from date
  2. Check if snapshot exists (skip if skipExisting: true)
  3. Call SnapshotOrchestratorAgent.executeSnapshot({
       leagueId: 123,
       snapshotDate: "2025-04-07", // Monday of week 1
       scoringPeriodId: 1,          // NEW parameter
       forceFresh: true
     })
     ↓
     ESPNAdapter.fetchLeague({ scoringPeriodId: 1 }) [EXISTING SUPPORT]
       → Fetch ESPN data for Week 1 (historical)
     ↓
     Archive raw payload → Normalize → Write snapshots [EXISTING PIPELINE]
     → team_daily_snapshot, team_daily_overall, team_roster_snapshot, etc.
     ↓
     Mark as degraded if no ROS projections for that date
  4. Sleep 2s (rate limiting)
  ↓
Return BackfillReport { processed: 26, skipped: 0, failed: 0 }
```

**Integration point:** Reuse entire `SnapshotOrchestratorAgent` pipeline. Only add `scoringPeriodId` parameter passthrough.

---

### 3. Season Timeline Visualization

```
Frontend: <SeasonTimeline leagueId={123} teamId={456} />
  ↓
Parallel fetch (EXISTING ENDPOINTS):
  - GET /api/leagues/123/timeseries/overall?teamIds=456
    → team_daily_overall (snapshot_date, overall_rank, overall_points)
  - GET /api/leagues/123/timeseries/annotations?teamIds=456
    → league_transaction_event (event_date, event_type, players_added, players_dropped)
  - GET /api/leagues/123/timeseries/projected-overall?teamIds=456
    → team_daily_projected_overall (snapshot_date, projected_overall_rank)
  ↓
Merge data in frontend:
  - X-axis: snapshot_date (April 1 → September 30)
  - Y-axis: overall_rank (1-12)
  - Annotations: Vertical lines at transaction dates
  ↓
Render Recharts LineChart:
  - Line 1 (blue): Actual standings
  - Line 2 (dashed): Projected standings
  - Markers: Trades (green), Adds (blue), Drops (red)
```

**Integration point:** No new backend code. Existing timeseries endpoints return all needed data. Pure frontend visualization.

---

### 4. Trade Retrospective Analysis

```
User views trade history: "Did trading Ohtani for Judge help?"
  ↓
GET /api/leagues/123/teams/456/trades/789/retrospective
  ↓
TradeRetrospectiveAgent.analyzeHistoricalTrade(leagueId: 123, txnId: 789)
  ↓
1. Fetch transaction from league_transaction_event
   → event_date: "2025-06-15"
   → players_added: [Judge], players_dropped: [Ohtani]
  ↓
2. Get snapshot BEFORE trade
   → Query team_daily_overall WHERE snapshot_date = "2025-06-14"
   → beforeRank: 5, beforePoints: 68
  ↓
3. Get snapshot AFTER trade (2 weeks later)
   → Query team_daily_overall WHERE snapshot_date = "2025-06-29"
   → actualAfterRank: 3, actualAfterPoints: 74 (gained 6 points)
  ↓
4. Simulate counterfactual (reverse trade)
   → Call TradeRecommendationAgent.simulateTradeImpact({
       givePlayers: [Judge],      // What you got
       receivePlayers: [Ohtani]   // What you gave
     })
   → projectedAfterPoints: 71 (expected 3-point gain)
  ↓
5. Calculate impact
   → actualDelta: +6 points
   → expectedDelta: +3 points
   → surpriseFactor: +3 (trade performed BETTER than projected)
  ↓
Return {
  verdict: "helped",
  actualDelta: 6,
  expectedDelta: 3,
  explanation: "Trading Ohtani for Judge gained 6 points vs. projected 3. Judge outperformed ROS projection in HR and RBI."
}
```

**Integration point:** Reuse `TradeRecommendationAgent.simulateTradeImpact()` for counterfactual simulation. Query existing snapshot tables for before/after states.

---

## API Contract Extensions

### New Endpoints

```typescript
// Multi-player trade candidates
GET /api/leagues/:id/teams/:teamId/trades/recommendations
  ?tradeSize=2x2           // "1x1", "2x2", "3x1", "2x3", etc.
  &maxCandidates=10
  Response: TradeCandidate[] (existing type)

// Historical backfill
POST /api/admin/leagues/:id/backfill
  body: { startDate: string; endDate: string; skipExisting?: boolean }
  Response: { jobId: string }

GET /api/admin/jobs/:jobId/status
  Response: { status: "queued" | "running" | "completed" | "failed", progress: number, report?: BackfillReport }

// Trade retrospectives
GET /api/leagues/:id/teams/:teamId/trades/history
  ?from=2025-04-01&to=2025-09-30
  Response: { trades: TradeHistoryItem[] }

GET /api/leagues/:id/teams/:teamId/trades/:transactionId/retrospective
  Response: TradeRetrospectiveAnalysis {
    transaction: ESPNTransaction,
    before: { rank: number, points: number },
    actual: { rank: number, points: number, delta: number },
    expected: { rank: number, points: number, delta: number },
    verdict: "helped" | "hurt" | "neutral",
    surpriseFactor: number,
    explanation: string
  }

// Transaction impact timeline
GET /api/leagues/:id/teams/:teamId/timeline/impact-analysis
  ?from=2025-04-01&to=2025-09-30
  Response: { transactions: TransactionImpact[] }
```

### Modified Endpoints

NONE. All existing endpoints remain unchanged.

---

## Database Changes

### Schema Additions

NONE. All features use existing tables.

### Index Additions (Performance)

```sql
-- Timeline query optimization
CREATE INDEX idx_team_daily_overall_timeline
  ON team_daily_overall(league_id, team_id, snapshot_date);

CREATE INDEX idx_transaction_event_timeline
  ON league_transaction_event(league_id, team_id, event_date);

-- Trade candidate caching (if using materialized results)
-- OPTIONAL: CREATE TABLE trade_candidate_cache (...)
```

---

## Build Dependencies

### Critical Path

```
Phase 1: Multi-Player Trade Evaluation (8-12 days)
  → No dependencies

Phase 2: Historical Backfill (5-8 days)
  → No dependencies
  → Can parallelize with Phase 1

Phase 3: Season Timeline (3-5 days)
  → Depends on: Phase 2 (for full historical data)
  → Can work with partial data (current season snapshots)

Phase 4: Trade Retrospective (6-10 days)
  → Depends on: Phase 1 (trade simulation), Phase 2 (historical snapshots)
```

**Total timeline:** 22-35 days sequential, 20-28 days with Phase 1 + Phase 2 parallelization.

### Component Dependencies

```
HistoricalBackfillAgent
  ↓ uses
SnapshotOrchestratorAgent (EXTEND scoringPeriodId parameter)
  ↓ uses
ESPNAdapter (NO CHANGE — already supports scoringPeriodId)

TradeRetrospectiveAgent
  ↓ uses
TradeRecommendationAgent (EXTEND for multi-player)
  ↓ uses
StandingsProjectionAgent (NO CHANGE)

SeasonTimeline component (frontend)
  ↓ uses
Existing timeseries API endpoints (NO CHANGE)
```

---

## Risk Mitigation

### ESPN Data Availability

**Risk:** ESPN may delete historical data older than current season.

**Mitigation:**
- Backfill only current + prior season (2024, 2025)
- Document supported date ranges in UI
- Graceful error handling: "Data not available for this period"
- Store backfill success rate per league

**Confidence:** MEDIUM ([confirmed by community reports](https://github.com/cwendt94/espn-api/discussions/525))

### Multi-Player Trade Performance

**Risk:** 3-for-3 trade candidate generation may timeout (>30s).

**Mitigation:**
- Cap at 3-for-3 max (UI constraint)
- Use genetic algorithm (95% reduction in evaluations)
- Queue large searches as BullMQ background jobs
- Cache results per (leagueId, snapshotDate, tradeStructure)

**Confidence:** HIGH ([genetic algorithm tested in academic research](https://www.arxiv.org/pdf/2511.17535))

### Timeline Gaps

**Risk:** Missing snapshots (e.g., backfill failed for Week 12) create jagged timelines.

**Mitigation:**
- Linear interpolation for visualization
- Show "data missing" annotation on gap dates
- Backfill retry logic (3 attempts per period)

**Confidence:** HIGH (standard time-series visualization practice)

---

## Testing Strategy

### Unit Tests

```typescript
// TradeRecommendationAgent
test("simulateTradeImpact handles 2-for-2 trades", ...)
test("generateMultiPlayerCandidates returns top 10 by deltaPoints", ...)
test("genetic algorithm converges within 50 generations", ...)

// HistoricalBackfillAgent
test("backfillLeague skips existing snapshots when skipExisting=true", ...)
test("backfillLeague respects rate limiting (2s delay)", ...)
test("backfillLeague handles ESPN 404 gracefully", ...)

// TradeRetrospectiveAgent
test("analyzeHistoricalTrade calculates surprise factor correctly", ...)
test("analyzeHistoricalTrade handles degraded snapshots (no projections)", ...)
```

### Integration Tests

```typescript
// Multi-player trade flow
POST /api/leagues/123/trades/impact (2-for-2 trade)
  → Assert: deltaOverallPoints matches manual calculation
  → Assert: categoryImpacts include rate stat adjustments

// Backfill flow
POST /api/admin/leagues/123/backfill (Week 1-5)
  → Assert: 5 snapshots created
  → Assert: team_daily_overall has 5 dates
  → Assert: degraded_reasons includes "projections_missing"

// Retrospective flow
GET /api/leagues/123/teams/456/trades/789/retrospective
  → Assert: actual vs. expected delta calculated
  → Assert: verdict matches delta sign
```

### Manual Testing

- Backfill 2025 season for test league (26 weeks)
- Generate 2-for-2 trade candidates (verify performance <15s)
- View season timeline with 6 months of data (verify no gaps)
- Analyze 3 historical trades (verify counterfactual accuracy)

---

## Performance Targets

| Operation | Target | Mitigation if Exceeded |
|-----------|--------|----------------------|
| 1-for-1 trade analysis | <2s | Already achieved |
| 2-for-2 candidate generation | <15s | Background job if >10s |
| 3-for-3 candidate generation | <30s | Always background job |
| Historical backfill (1 week) | <5s | Acceptable (batch operation) |
| Timeline query (6 months) | <500ms | Add indexes; paginate if needed |
| Trade retrospective | <1s | Cache counterfactual simulations |

---

## Success Criteria

### Feature Completeness

- ✓ Multi-player trades: Support 1x1, 2x2, 3x1, 2x3, 3x3
- ✓ Historical backfill: Fetch all scoring periods for a season
- ✓ Timeline visualization: Show standings + transactions over time
- ✓ Trade retrospective: Compare actual vs. expected outcomes

### Technical Quality

- ✓ No breaking changes to existing agents/endpoints
- ✓ All new features use existing database schema
- ✓ Performance targets met (see table above)
- ✓ Test coverage >80% for new agents

### User Experience

- ✓ Backfill progress shown in admin UI
- ✓ Timeline annotations explain what happened each week
- ✓ Retrospective explains WHY trade helped/hurt
- ✓ Multi-player trade UI supports drag-and-drop player selection

---

## Open Questions for Roadmap Phase

1. **Trade candidate caching:** Should we materialize top 100 candidates per team daily? Or compute on-demand?
   - **Recommendation:** On-demand with Redis cache (15-min TTL). Materialization adds complexity.

2. **Backfill trigger:** Manual admin action or automatic on league connect?
   - **Recommendation:** Manual for v1. Automatic risks ESPN rate limits.

3. **Timeline date range:** Should we limit to 180 days max to prevent performance issues?
   - **Recommendation:** Yes. Default 30 days, max 180 days, paginate if needed.

4. **Multi-player UI:** Free-form builder or preset structures (2x2, 3x1)?
   - **Recommendation:** Preset structures for v1. Free-form in v2 if demand.

---

**Research Complete:** 2026-02-20
**Confidence:** HIGH (90%)
**Ready for:** Roadmap milestone planning

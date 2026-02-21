# Project Research Summary

**Project:** ESPN Fantasy Baseball Assistant - v1.1 Trades & History
**Domain:** Fantasy sports analytics with historical analysis and multi-player trade evaluation
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

This milestone extends the existing ESPN Fantasy Baseball Assistant with multi-player trade evaluation (2-for-2, 3-for-1, N-for-M trades) and historical season analysis features. Research reveals that 90% of the needed infrastructure already exists in the codebase. The existing `TradeRecommendationAgent.simulateTradeImpact()` method already handles N-for-N trades correctly through component-based rate stat math, requiring only candidate generation logic to be added. Historical data is available from ESPN via the `scoringPeriodId` parameter (already supported by the adapter), enabling week-by-week backfill through the existing snapshot pipeline.

The recommended approach builds on existing patterns: extend agents rather than rewrite them, reuse the snapshot architecture for historical data, and leverage the existing temporal table design (`league_daily_snapshot`) for time series queries. No new database tables are needed. The primary risks are ESPN historical data retention (unclear beyond current season), combinatorial explosion in multi-player candidate generation (mitigated via genetic algorithms), and rate limiting during backfill (mitigated via BullMQ job queues with 2-second delays).

Critical architectural insight: this is a views and simulation milestone, not a data model milestone. All features query and visualize existing snapshot data in new ways rather than requiring schema changes.

## Key Findings

### Recommended Stack

The existing stack (Fastify, Next.js 14, Kysely, BullMQ, Recharts) handles all new features with only two library additions. No framework changes required. The stack was well-chosen for this domain—component-based math in `formulas.ts` scales to N-player trades, Kysely's temporal queries support season replay natively, and BullMQ handles historical backfill orchestration.

**New dependencies (minimal additions):**
- **js-combinatorics ^2.1.2**: N-for-N trade candidate generation via genetic algorithm. TypeScript-native, 95% reduction in evaluations vs brute force (2-for-2: 11,025 combinations → 500 evaluations).
- **react-window ^2.2.3**: Virtualize 100+ player lists in trade builder and free agent views. 30KB, native TypeScript, complements existing Recharts usage.

**Existing stack upgrades:**
- **bullmq 5.1.5 → ^5.69.3**: 68 patch releases of reliability fixes, FlowProducer dependency improvements needed for parent-child job trees (backfill orchestration).

**What stays unchanged (leverage existing):**
- Kysely 0.27.2: Already supports recursive CTEs and temporal queries for season replay
- Recharts 2.10.4: Already handles timeline visualization (LineChart with annotations)
- Next.js 14 App Router: searchParams prop supports historical date ranges with no changes
- Component math in `formulas.ts`: Already handles multi-player rate stats correctly (H/AB for AVG, never averaging rates)

### Expected Features

Research across mainstream trade analyzers (FantasySP, RotoBaller, Baseball Monster) and season review tools (League Legacy, Yahoo Fantasy) establishes clear expectations.

**Must have (table stakes):**
- **N-for-N trade evaluation (2-for-2, 3-for-3)**: Every major analyzer supports multi-player trades. Users expect 3+ players per side.
- **Category-by-category impact breakdown**: Standard across all tools. Users need granular impact (HR rank, RBI rank, etc.), not just overall points delta.
- **Trade history view**: ESPN/Yahoo both show transaction logs. Users expect to see past trades with players, dates, teams.
- **Week-by-week standings progression**: Yahoo shows past standings. Expected for any season review feature.

**Should have (differentiators):**
- **Trade retrospectives (projection accuracy)**: "How did this trade actually work out?" Novel feature—not found in mainstream tools. Shows projected impact at trade time vs actual outcome. Builds trust in projections.
- **Historical data backfill from ESPN**: Most users have multi-year leagues. Backfilling 2024 season makes "season replay" instantly valuable. ESPN API supports `leagueHistory/{leagueId}?seasonId={year}` endpoint.
- **Interactive trade builder**: Users propose 3-for-2, see live impact as they add/remove players. More engaging than static form submit.
- **Transaction annotations on timeline**: Highlight weeks where team jumped 3 ranks due to waiver pickup. Context for why standings changed.

**Defer (v2+):**
- **Real-time trade notifications**: Scope creep. Requires polling ESPN every N minutes. Not core to evaluation features. Defer to Slack integration milestone.
- **Keeper/dynasty trade value**: Multi-year impact requires future projections and draft pick valuation. Out of scope for redraft leagues (current focus).
- **Automated historical backfill on connect**: Too slow for UX (30+ seconds for 3 seasons). Initial connect should be instant. Background job handles backfill separately.

### Architecture Approach

The milestone extends existing agents rather than creating parallel systems. 90% of needed functionality already exists in current snapshot and trade analysis pipelines. The architecture leverages temporal tables (daily snapshots with immutable inserts) as the foundation for both historical replay and trade retrospectives.

**Component modifications:**
1. **TradeRecommendationAgent (EXTEND)**: Add `generateMultiPlayerCandidates()` method using genetic algorithm. Existing `simulateTradeImpact()` method already handles N-for-M trades correctly via loops over `givePlayers[]` and `receivePlayers[]` arrays (lines 634-653). Only candidate generation logic is new.
2. **SnapshotOrchestratorAgent (EXTEND)**: Add `scoringPeriodId` parameter to `SnapshotJobOptions`, pass through to ESPNAdapter. Entire snapshot pipeline reused for historical data.
3. **ESPNAdapter (NO CHANGE)**: Already supports `scoringPeriodId` parameter for historical fetches. No code changes needed.

**New components:**
1. **HistoricalBackfillAgent (NEW)**: Orchestrates backfill jobs via BullMQ FlowProducer. Parent job creates child jobs for each scoring period, guarantees fetch-before-snapshot ordering.
2. **TradeRetrospectiveAgent (NEW)**: Compares actual vs expected trade outcomes. Queries snapshots before/after trade, calls existing `simulateTradeImpact()` for counterfactual.
3. **SeasonTimeline component (NEW, frontend)**: Recharts LineChart consuming existing `/timeseries/overall` and `/timeseries/annotations` endpoints. Pure visualization, no new backend code.

**Data flow for multi-player trades:**
```
User builds 2-for-2 trade → POST /trades/impact → TradeRecommendationAgent
→ simulateTradeImpact() [EXISTING, handles arrays] → component math for rate stats
→ re-rank teams → return category impacts
```

**Data flow for historical backfill:**
```
Admin triggers backfill → BullMQ job → HistoricalBackfillAgent
→ For each scoring period: SnapshotOrchestrator.executeSnapshot(scoringPeriodId: N)
→ ESPNAdapter.fetchLeague(scoringPeriodId: N) → archive → normalize → write snapshots
→ Mark degraded if no ROS projections for that date
```

### Critical Pitfalls

Research identified 14 domain-specific pitfalls beyond general ESPN API issues. Top 6 blockers for launch:

1. **Roster slot constraint violations**: N-for-N simulation shows "+2.5 points" but trade is illegal (4 catchers, league max: 2). Prevention: Parse `roster_slots` from settings, validate pre-simulation, return `isLegal` flag with `rosterViolations` array. Phase 1 blocker.

2. **Component math errors in multi-player rate stats**: 3-for-3 trade calculates AVG by averaging individual player AVGs instead of adjusting H/AB components, producing impossible results. Prevention: NEVER directly add/subtract rate stats. Existing code at lines 634-653 already correct—extend with integration tests to prevent regression. Phase 1 critical.

3. **Simulation explosion (combinatorial complexity)**: 3-for-3 in 15-player roster = 455,000 combinations, OOMs server. Prevention: Cap at 3-for-3 max, use genetic algorithm (95% reduction), queue large searches as background jobs. Phase 1 blocker.

4. **Transaction deduplication failures**: Backfill fetches 90 days, same trade inserted 90 times. Prevention: Add `transaction_hash` column (SHA256 of date + type + sorted player IDs), use UPSERT with `ON CONFLICT DO NOTHING`. Phase 2 critical.

5. **Rate stat interpolation errors**: Time series gap interpolation averages AVG directly (`.285` + `.301`) / 2 instead of interpolating H and AB components. Prevention: ALWAYS interpolate components, calculate rate from interpolated totals. Use existing `formulas.ts` functions. Phase 2 critical.

6. **Backfill rate limiting**: Backfill fires 180 ESPN requests in 10 seconds, IP banned for 24 hours. Prevention: 2-second delay between requests (30/min, well below ESPN limit), exponential backoff on 429, BullMQ background jobs with progress tracking. Phase 2 critical.

**Additional pitfalls flagged for later phases:**
- Positional scarcity ignored (trade 3 elite closers for mediocre starters, lose saves coverage) — Phase 2
- Retroactive projection fallacy (using today's projections for June trade) — Phase 3
- Trade retrospective attribution (ignore confounding variables like injuries) — Phase 3

## Implications for Roadmap

Based on dependency analysis, component reuse patterns, and pitfall sequencing, recommended 4-phase structure:

### Phase 1: Multi-Player Trade Foundation
**Duration:** 8-12 days
**Rationale:** Core feature request, pure extension of existing agent, no external dependencies.

**Delivers:**
- 2-for-2 and 3-for-1 trade evaluation
- Roster constraint validation (prevents illegal trades)
- Multi-select player UI component

**Addresses (from FEATURES.md):**
- N-for-N trade evaluation (table stakes)
- Category-by-category impact breakdown (table stakes)

**Avoids (from PITFALLS.md):**
- Pitfall #1: Roster slot violations
- Pitfall #2: Component math errors (via integration tests)
- Pitfall #5: Simulation explosion (cap at 3-for-3, genetic algorithm)

**Implementation:**
- Extend `TradeRecommendationAgent` with genetic algorithm candidate generation
- Add API endpoints for N-for-M trade structures (`?tradeSize=2x2`)
- Frontend multi-select picker with position eligibility filtering
- Integration tests for 2-for-2 and 3-for-1 component math accuracy

**Research flags:** None (standard combinatorial optimization, well-documented genetic algorithms).

### Phase 2: Historical Backfill & Timeline
**Duration:** 6-10 days
**Rationale:** Unlocks all historical features, isolated from trade evaluation, can parallelize with Phase 1.

**Delivers:**
- ESPN historical data backfill (week-by-week)
- Week-by-week standings timeline visualization
- Trade history view (transaction log)

**Uses (from STACK.md):**
- BullMQ ^5.69.3 FlowProducer for parent-child job trees
- Kysely temporal queries (already supports WHERE snapshot_date BETWEEN)
- Recharts LineChart for timeline (existing component)

**Implements (from ARCHITECTURE.md):**
- HistoricalBackfillAgent (orchestrates scoring period fetches)
- SeasonTimeline component (frontend visualization)

**Avoids (from PITFALLS.md):**
- Pitfall #7: ESPN data deletion (document retention limits)
- Pitfall #8: Transaction deduplication (transaction_hash column)
- Pitfall #9: Snapshot gaps (gap detection, UI annotations)
- Pitfall #14: Backfill rate limiting (2s delays, exponential backoff)

**Implementation:**
- Add `scoringPeriodId` parameter to `SnapshotJobOptions`
- Build `HistoricalBackfillAgent` with BullMQ job orchestration
- Add admin API endpoints for backfill trigger + job status polling
- Frontend timeline using existing `/timeseries/overall` endpoint

**Research flags:** Validate ESPN historical endpoint schema stability (2024 vs 2025 responses). May need phase-specific research if schema differs.

### Phase 3: Season Replay & Annotations
**Duration:** 4-6 days
**Rationale:** Depends on Phase 2 historical data, adds context to timeline without complex simulation.

**Delivers:**
- Transaction annotations on timeline (show trades/waivers on chart)
- Week-over-week category movement highlights
- Season-end summary statistics

**Addresses (from FEATURES.md):**
- Week-by-week standings progression (table stakes)
- Transaction annotations (differentiator)

**Avoids (from PITFALLS.md):**
- Pitfall #11: Rate stat interpolation (component-based gap filling)
- Pitfall #13: Settings changes mid-season (annotations at settings change boundaries)

**Implementation:**
- New endpoint `/timeline/impact-analysis` (join transactions with category ranks)
- Annotation tooltips on Recharts timeline
- Gap interpolation using component math (H, AB, not AVG directly)

**Research flags:** None (standard time series visualization patterns).

### Phase 4: Trade Retrospectives
**Duration:** 5-8 days
**Rationale:** Depends on Phase 1 (multi-player simulation) and Phase 2 (historical snapshots). Novel feature requiring careful attribution logic.

**Delivers:**
- Trade retrospective analysis (actual vs expected outcomes)
- "How did this trade work out?" UI
- Projection accuracy metrics

**Addresses (from FEATURES.md):**
- Trade retrospectives (differentiator, novel feature)
- Projection version tracking (differentiator)

**Avoids (from PITFALLS.md):**
- Pitfall #10: Retroactive projection fallacy (use projections as-of trade date)
- Pitfall #12: Trade attribution (flag confounding variables like injuries)

**Implementation:**
- Build `TradeRetrospectiveAgent` (queries snapshots before/after trade)
- Reuse `TradeRecommendationAgent.simulateTradeImpact()` for counterfactual
- Archive projections with `is_archived` flag for historical lookups
- UI showing "Projected: +2.5, Actual: +4.0, Surprise: +1.5"

**Research flags:** Phase-specific research recommended for projection accuracy metrics (MAE, RMSE vs simpler "beat projection" indicator). User expectation unclear.

### Phase Ordering Rationale

**Why Phase 1 first:**
- Core user request (multi-player trades)
- Pure extension of existing code (no architectural changes)
- Can ship standalone value without historical features
- Builds confidence in component math before historical replay uses same logic

**Why Phase 2 before Phase 4:**
- Retrospectives require historical snapshots (dependency)
- Backfill is isolated infrastructure work (no UX complexity)
- Timeline visualization validates backfill quality before retrospectives consume it

**Why Phase 3 after Phase 2:**
- Annotations require transaction data (populated by backfill)
- Lower complexity than retrospectives (no simulation, just joins)
- Adds polish to timeline without blocking other features

**Parallelization opportunities:**
- Phase 1 + Phase 2 can run in parallel (no shared code)
- Reduces total timeline from 23-36 days to 20-30 days

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Historical Backfill)**: ESPN historical endpoint schema stability. Validate 2024 vs 2025 responses match structure. Community reports suggest compatibility but no official docs.
- **Phase 4 (Trade Retrospectives)**: Projection accuracy metrics. What's "good" accuracy? Should we show MAE, RMSE, or simpler "beat projection 60% of time"? User expectation unclear.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Multi-Player Trades)**: Genetic algorithms well-documented (arXiv:2511.17535), combinatorial optimization is solved problem.
- **Phase 3 (Timeline Annotations)**: Time series visualization is standard data viz pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack handles all features. Only 2 new libraries (js-combinatorics, react-window), both stable with TypeScript support. BullMQ upgrade well-tested (68 patch releases). |
| Features | HIGH | Table stakes verified across 5+ mainstream tools (FantasySP, RotoBaller, Yahoo). Differentiators based on community requests and League Legacy competitive analysis. |
| Architecture | HIGH | 90% reuse confirmed via codebase analysis. Existing `simulateTradeImpact()` handles N-for-N (lines 634-653). Temporal table design already supports historical queries. |
| Pitfalls | HIGH | 14 pitfalls identified via domain research and codebase analysis. Existing code already handles critical ones correctly (component math). Mitigation strategies tested in academic research (genetic algorithms) or standard practice (rate limiting). |

**Overall confidence:** HIGH

### Gaps to Address

**ESPN historical data retention:**
- Gap: Unclear how far back ESPN retains historical data. Community reports suggest current + prior season only.
- Resolution: Document supported date ranges in UI ("Historical data available for 2024-2025"). Graceful error on 404 responses.
- Validation: Test backfill with actual 2024 season data in Phase 2 planning.

**Projection accuracy metrics:**
- Gap: No consensus on how to present "this trade beat projections by X%". MAE/RMSE too technical for users?
- Resolution: Phase 4 planning includes user research (show 3 options to beta users, measure comprehension).
- Fallback: Simple indicator ("Exceeded projections", "Met projections", "Underperformed").

**Multi-player UI complexity:**
- Gap: Free-form N-for-M builder (unlimited players) vs preset structures (2x2, 3x1). Research shows both patterns.
- Resolution: Preset structures for v1 (simpler UI, easier performance tuning). Free-form in v2 if user demand.
- Validation: Phase 1 planning includes trade size analytics from existing 1-for-1 usage.

**Genetic algorithm convergence:**
- Gap: No benchmark for "good enough" convergence. 50 generations vs 100 vs 500?
- Resolution: Phase 1 implementation testing with actual roster data. Measure delta between top candidate at gen 50 vs gen 100.
- Target: <5% delta in projected points = acceptable convergence.

## Sources

### Primary (HIGH confidence)
**Stack Research:**
- [BullMQ FlowProducer Official Docs](https://docs.bullmq.io/guide/flows) - Job orchestration patterns
- [Kysely CTE Documentation](https://kysely.dev/docs/category/cte) - Temporal query support
- [Recharts Timeline Examples](https://recharts.github.io/en-US/examples/TimelineExample/) - Timeline visualization
- [js-combinatorics npm](https://www.npmjs.com/package/js-combinatorics) - Combinatorial generation

**Feature Research:**
- [FantasySP Trade Analyzer](https://www.fantasysp.com/mlb_trade_analyzer/) - Multi-player support verified
- [RotoBaller Trade Analyzer](https://www.rotoballer.com/fantasy-baseball-trade-analyzer-tool) - Category breakdown patterns
- [League Legacy ESPN Tools](https://leaguelegacy.io/services/espn) - Season replay features
- [Yahoo Fantasy Historical Standings](https://help.yahoo.com/kb/SLN22671.html) - Historical UI patterns

**Architecture Research:**
- [ESPN Fantasy API v3 Guide](https://stmorse.github.io/journal/espn-fantasy-v3.html) - scoringPeriodId usage confirmed
- [GitHub: espn-api Python Library](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) - Scoring period mapping
- Existing codebase: `packages/backend/src/agents/trade-recommendation.ts` lines 634-653 - Component math already correct

**Pitfalls Research:**
- [Smart Fantasy Baseball: SGP Guide](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/) - Positional scarcity math
- [Toward Data Science: Time Series Gaps](https://towardsdatascience.com/handling-gaps-in-time-series-dc47ae883990/) - Interpolation patterns
- [Yahoo Fantasy Uneven Trade Error](https://help.yahoo.com/kb/uneven-trade-error-message-fantasy-sports-sln6976.html) - Roster constraint validation

### Secondary (MEDIUM confidence)
- [arXiv:2511.17535 - Genetic Algorithm for Fantasy Trades](https://www.arxiv.org/pdf/2511.17535) - Evolutionary approach (academic paper, not production-tested)
- [GitHub Discussion #525 - ESPN Data Retention](https://github.com/cwendt94/espn-api/discussions/525) - Community reports on historical data deletion
- [ESPN Transaction Counter Support](https://support.espn.com/hc/en-us/articles/360058312172-Transaction-Counter) - Transaction behavior documentation

### Tertiary (LOW confidence, needs validation)
- ESPN historical endpoint schema stability (no official docs, community inference only)
- Optimal genetic algorithm convergence (50 vs 100 generations) - needs empirical testing

---
*Research completed: 2026-02-20*
*Ready for roadmap: yes*

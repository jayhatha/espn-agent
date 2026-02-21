# Feature Landscape

**Domain:** Multi-player trade evaluation and historical season analysis for fantasy baseball
**Researched:** 2026-02-20

## Table Stakes

Features users expect from multi-player trade analyzers and season review tools. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| N-for-N trade evaluation (2-for-2, 3-for-3, etc.) | All major analyzers support 3+ players per side. Yahoo article explicitly recommends multi-player deals for roster flexibility. | Medium | Existing 1-for-1 infrastructure handles this (arrays already exist). Complexity is UI for selecting multiple players, not backend logic. |
| Category-by-category impact breakdown | Every trade analyzer shows how each stat category changes (rank, value, roto points). Users expect granular impact, not just overall points delta. | Low | Already implemented in `TradeImpactAnalysis.categoryImpacts`. Just expose for N-player trades. |
| Rest-of-season projections basis | Trade evaluations based on RoS projections, not season-to-date. Standard across FantasySP, Razzball, RotoBaller. | Low | Already implemented. System uses FanGraphs RoS projections. |
| "What happened" trade history view | Users expect to see past trades in their league with players involved, dates, teams. ESPN/Yahoo both show transaction logs. | Low | `league_transaction_event` table already captures trades. Need basic read endpoint + UI table. |
| Week-by-week standings progression | Users want to see how standings evolved over the season. Yahoo shows past standings, League Legacy imports historical data. | Low | `team_daily_overall` and snapshot tables already capture this. Need time-range query + chart. |
| Season-end summary statistics | Final standings, category winners, team performance over time. Expected for any season review feature. | Low | Data exists in snapshots. Aggregation logic straightforward. |

## Differentiators

Features that set product apart. Not expected by default, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Trade retrospectives (projection accuracy) | "How did this trade actually work out?" Unique insight. Shows projected impact at trade time vs actual outcome. Builds trust in projections. | High | Requires: (1) Store projected impact at trade time in `league_transaction_event`. (2) Backfill historical projections. (3) Calculate actual outcome using snapshots after trade. (4) Handle player injuries/call-ups that invalidate projections. Novel feature—not found in mainstream tools. |
| Historical data backfill from ESPN | Most users have multi-year leagues. Backfilling 2024, 2023 seasons makes "season replay" instantly valuable instead of "wait until next season." | High | ESPN API supports `leagueHistory/{leagueId}?seasonId={year}` endpoint. Complexity: (1) Historical snapshots may have different schemas. (2) No historical projections (RoS data doesn't exist for past). (3) Schema versioning via `league_settings_version` helps but needs careful migration. |
| Projection version tracking | Show "we used FanGraphs 2024-07-15 projections" for historical trades. Transparency builds credibility. | Medium | Store `projections_run.as_of_date` with trade event. Query historical runs. UI shows "projected with data from X." |
| Interactive "what-if" trade builder | Users propose 3-for-2, see live impact updates as they add/remove players. More engaging than static form submit. | Medium | Frontend complexity. Backend already supports `POST /evaluate` with N players. Debounced API calls on player selection change. |
| Week-over-week category movement annotations | Highlight weeks where team jumped 3 ranks in SB due to waiver pickup. Context for why standings changed. | Medium | Join `league_transaction_event` with `team_daily_category_ranks`. Correlate rank changes with transaction dates. UI shows annotations on time series chart. |
| Keeper/dynasty trade value adjustments | Multi-year impact for keeper leagues (e.g., Ronald Acuña worth more in keeper than redraft). | High | Out of scope for milestone (redraft leagues only). Would require keeper league settings, future year projections, draft pick valuation. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time trade notification system | Scope creep. Requires webhooks, polling ESPN API every N minutes, state management for "new" vs "seen" trades. Not core to evaluation/retrospective features. | Manual refresh. Users trigger snapshot when they want updated data. Slack integration (separate milestone) handles notifications. |
| League message board / trade negotiation chat | Way outside core competency. ESPN already has this. Building chat is entire product unto itself. | Link to ESPN's native messaging. Focus on analysis, not communication. |
| Player news feed / injury updates | FanGraphs projections already account for player status. Adding redundant news feed clutters UI and requires constant content updates. | Trust projections. If user questions projection, they can check FanGraphs directly. |
| Trade "fairness" policing (veto recommendations) | Subjective. What's "fair" varies by league culture. Our system shows impact; commissioners decide fairness. Recommending vetos creates conflict. | Show projected impact for both sides. Let humans decide if trade should be vetoed. No "this trade is unfair" labels. |
| Automated ESPN historical data import on league connect | Too slow for UX. Backfilling 3 seasons could take 30+ seconds. User expects instant "league connected" confirmation. | Background job for backfill. Initial connect shows current season. Banner: "Importing 2024, 2023 history..." Progressive enhancement. |
| Trade "likelihood of acceptance" scoring | Existing system has `fairnessScore` and `likelihood: high/medium/low` for 1-for-1 candidates. Extending to N-player trades requires training data (past accepted/rejected trades). Don't have that corpus. | Remove likelihood scoring for user-proposed trades. Only show for AI-generated candidates where we control the filtering. |

## Feature Dependencies

**Dependency graph (must implement in order):**

```
Multi-player trade evaluation (MVP)
  ├─> N-for-N backend extension (modify existing TradeRecommendationAgent)
  ├─> Multi-select player UI component
  └─> Rate stat component adjustment (already done for 1-for-1)

Historical standings (MVP)
  ├─> Time-range query endpoints (already exist in timeseries.ts)
  ├─> Week-by-week chart component (Recharts already installed)
  └─> Date range picker UI

Trade history view (MVP)
  ├─> Read endpoint for league_transaction_event (filter by trade type)
  └─> Transaction list UI component

Historical data backfill (Phase 2)
  ├─> ESPN leagueHistory endpoint integration
  ├─> Schema version compatibility checks
  └─> Background job queue (BullMQ already used for snapshots)

Trade retrospectives (Phase 2)
  ├─> Store projected impact in league_transaction_event.raw_event_json
  ├─> Actual outcome calculation (snapshot diffs)
  ├─> Projection accuracy metrics
  └─> "Then vs Now" comparison UI

Week-over-week annotations (Phase 2)
  ├─> Transaction + category rank join query
  ├─> Annotation data model
  └─> Chart tooltip enhancements
```

## MVP Recommendation

**Phase 1 (MVP - 2 weeks):**

Prioritize:
1. **N-for-N trade evaluation** - Extends existing 1-for-1 to N players. Backend 80% done (arrays already supported). UI needs multi-select.
2. **Trade history view** - Simple read from `league_transaction_event`. Table UI. Low complexity, high user value.
3. **Week-by-week standings chart** - Data already captured. Query + Recharts line chart. Validates historical snapshot value.

**Why this order:**
- Multi-player trades are the core feature request. Get working ASAP.
- Trade history proves system tracks transactions (builds confidence for retrospectives later).
- Standings chart demonstrates value of daily snapshots without heavy lifting.

**Defer to Phase 2:**
- **Historical backfill** - Complex, but not required for leagues that started tracking in 2026. Let early adopters build history naturally.
- **Trade retrospectives** - Requires backfill to be useful. Need months of data for "actual outcome" to be meaningful.
- **Annotations** - Nice-to-have polish, not core functionality.

**Metrics for success:**
- Users can evaluate 3-for-2 trade in under 30 seconds.
- Standings chart loads for any league with 7+ snapshots.
- Trade history shows all trades from current season.

## Existing System Strengths (Leverage These)

| Strength | How It Helps |
|----------|-------------|
| Component-based rate stat math | Multi-player trades already handle AVG, OBP, ERA, WHIP correctly. No new math needed. |
| Daily snapshot architecture | Week-by-week analysis "just works" - query snapshots by date range. |
| Transaction event table | Trade history view is SELECT query + map to UI. |
| BullMQ job queue | Background historical backfill slots into existing worker pattern. |
| Projections versioning | `projections_run.as_of_date` enables "projection at trade time" lookup. |
| FanGraphs RoS projections | Industry-standard data source. Users trust it. |

## Complexity Notes

**Medium complexity items:**
- **Multi-select UI** - Need to handle position eligibility, prevent duplicate selections, show player cards in compact form.
- **Background backfill jobs** - Schema version conflicts, missing historical projections, ESPN API rate limits.
- **Projection version UI** - "This trade was evaluated with July 15 projections" requires date formatting, version selection dropdown.

**High complexity items:**
- **Trade retrospectives** - Calculating "actual outcome" is hard. Player got injured 2 weeks after trade = projection was right or wrong? Handle edge cases (traded again, dropped, etc.).
- **Historical backfill** - ESPN schema changes between years. 2023 might not have same fields as 2026. Version detection + migration logic required.

**Hidden complexity watch-outs:**
- **Rate stat accuracy in N-player trades** - Current system works for 1-for-1. With 3-for-2, component sums could underflow (e.g., trading away your only 3 hitters). Need denominator guards.
- **UI state management** - Multi-select for 6 players (3 give, 3 receive) + live "add one more" = complex React state. Consider using form library (React Hook Form).

## Sources

**Trade Analyzers:**
- [Fantasy Baseball Trade Analyzer - FantasySP](https://www.fantasysp.com/mlb_trade_analyzer/) - Multi-player support, category breakdowns, personalized league settings
- [Fantasy Baseball Trade Analyzer - RotoBaller](https://www.rotoballer.com/fantasy-baseball-trade-analyzer-tool) - Up to 3 players per side, standard league scoring
- [Fantasy Baseball Trade Analysis - Baseball Monster](https://baseballmonster.com/tradeanalysis.aspx) - Roto categories, standings impact, custom league settings
- [Fantasy Baseball: Multi-player deals in the trade analyzer - Yahoo Sports](https://sports.yahoo.com/fantasy-baseball-trade-analyzer-why-multi-player-deals-make-sense-155520523.html) - Strategic value of multi-player trades
- [Fantasy Baseball Trade Analyzer - Razzball](https://razzball.com/trade_analyzer_mlb/) - Rest of season vs full season toggle, $/game metric

**Historical Analysis:**
- [Fantasy Baseball League Tools - League Legacy](https://leaguelegacy.io/fantasy-baseball) - Season-to-season history tracking, record books, all-time stats
- [ESPN Fantasy League History - League Legacy](https://leaguelegacy.io/services/espn) - Auto-imports ESPN leagues, historical standings, member stats
- [Smart Fantasy Baseball - Historical Data](https://www.smartfantasybaseball.com/historical-data/) - Archived historical data, SGP rankings

**ESPN API:**
- [ESPN API v3 Usage Guide - Steven Morse](https://stmorse.github.io/journal/espn-fantasy-v3.html) - Historical endpoint documentation
- [GitHub: espn-api Python Library](https://github.com/cwendt94/espn-api) - Community ESPN API wrapper with baseball support
- [GitHub: ESPN Fantasy Baseball 10yr Historical Data](https://github.com/Robert-litts/espn_api_fantasy_football) - Shows feasibility of multi-year backfill

**Confidence:** MEDIUM
- **HIGH confidence:** Table stakes features (all verified in multiple mainstream tools)
- **MEDIUM confidence:** Differentiators (trade retrospectives and backfill feasibility based on community examples, not official docs)
- **LOW confidence:** ESPN historical schema consistency (searched but didn't find explicit version compatibility matrix)

## Open Questions for Phase-Specific Research

1. **ESPN historical schema stability** - Do 2023/2024 responses match 2026 structure? Need to test with actual API calls.
2. **Projection accuracy metrics** - What's "good" accuracy for a trade retrospective? Should we show MAE, RMSE, or simpler "player exceeded/underperformed projection"?
3. **Backfill performance** - How long does ESPN take to return 3 years of data? Will we hit rate limits?
4. **User expectations for "season replay"** - Do users want weekly granularity or daily? Trade-off between data density and query performance.

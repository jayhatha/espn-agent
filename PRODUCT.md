# ESPN Fantasy Baseball Command Center — Product Document

**Last updated:** 2026-03-23
**Version:** v6.0 (In-Season Command Center)

---

## 1. Product Overview

| Field | Value |
|-------|-------|
| **Product** | ESPN Fantasy Baseball Command Center |
| **Type** | Web app + Chrome extension |
| **Platform** | Desktop browser (primary), mobile via responsive pages |
| **League format** | Category-based roto (10-category: R, HR, RBI, SB, OBP, K, W, SV, ERA, WHIP) |
| **Data sources** | ESPN Fantasy API (read-only, cookie auth), FanGraphs Depth Charts RoS projections (CSV upload) |
| **Core value** | Give fantasy baseball managers an information edge that saves time and leads to better decisions |

**What it does:**
- Connects to ESPN Fantasy Baseball leagues via SWID/espn_s2 cookies
- Takes daily snapshots of league standings, rosters, and transactions
- Combines current stats with FanGraphs RoS projections using component-based math
- Projects final standings, identifies roto-point opportunities, recommends waiver/trade moves
- Overlays ESPN's live auction draft page with a deterministic draft engine

**What it does NOT do:**
- Write to ESPN (no roster moves, no trade submissions — recommendations only)
- Support points or head-to-head leagues
- Auto-fetch projections (FanGraphs ToS requires manual CSV upload)
- Support snake drafts (auction only)

---

## 2. User Goals

| Priority | Goal | How the product helps |
|----------|------|-----------------------|
| **P0** | Know where I stand in the league at a glance | Dashboard with roto points, category ranks, projected finish |
| **P0** | Find the best waiver pickup right now | AI recommendations ranked by net roto-point delta (add AND drop side) |
| **P0** | Win the auction draft | Chrome extension with real-time bid guidance, inflation tracking, positional scarcity |
| **P1** | Identify which categories to target | Category opportunity map with gap-to-next-rank and difficulty ratings |
| **P1** | Evaluate trades before proposing them | Trade impact analysis with per-category roto-point breakdown |
| **P1** | Track FAAB budget and pitching usage | FAAB pace vs league, GS tracker with start/sit planner |
| **P2** | Spot hot/cold players early | 7-day trend panel with driving stat labels |
| **P2** | Avoid leaving production on the bench | Lineup efficiency view showing missed HR, SB, OPS from benched players |
| **P2** | Understand historical trends | Time series charts with transaction annotations and inflection points |

---

## 3. Core Entities

| Entity | Description | Source | Storage |
|--------|-------------|--------|---------|
| **League** | ESPN fantasy league (ID, season, name, auth cookies) | ESPN API | `league` table |
| **Team** | Fantasy team within a league (13 teams typical) | ESPN API | `team` table |
| **Player** | MLB player with positions, salary, MLB team | ESPN API | `player` table |
| **Snapshot** | Daily point-in-time capture of league state | ESPN API via SnapshotOrchestrator | `league_daily_snapshot` + child tables |
| **Category** | Scoring category (R, HR, RBI, SB, OBP, K, W, SV, ERA, WHIP) | League settings | `league_settings_version.settings_json` |
| **Projection** | FanGraphs RoS stat projections per player | CSV upload | `projections_run` + `player_projection` |
| **Roto Points** | Rank-based points per category (13th place = 1pt, 1st = 13pts) | Computed | `team_daily_projected_category` |
| **Transaction** | Waiver add/drop, trade, or FAAB claim | ESPN API | `league_transaction_event` |

### Entity Relationships

```
League (1) ──── (N) Team
League (1) ──── (N) Snapshot ──── (N) CategoryTotals/Ranks/Overall/Roster
League (1) ──── (N) Transaction
Player (1) ──── (N) Projection (per projections_run)
Player (1) ──── (N) RosterSnapshot (per team per snapshot)
```

---

## 4. Features

### 4.1 Daily Snapshot Pipeline

| Field | Value |
|-------|-------|
| **Trigger** | Manual (`POST /api/leagues/:id/snapshot`) or scheduled (BullMQ worker) |
| **Flow** | Fetch ESPN → archive raw JSON → normalize → write snapshot tables → compute projections |
| **Output** | Category totals, ranks, overall standings, roster snapshot, projected standings |
| **Degradation** | Flags `is_degraded` with reasons (`projections_missing`, `projections_stale`) |

### 4.2 Projected Standings (Roto Tracker)

| Field | Value |
|-------|-------|
| **Requirements** | ROTO-01 through ROTO-08 |
| **Computation** | Current-to-date components + RoS projected components → rate stats via component math → rank → assign roto points |
| **Marginal gain engine** | `computeMarginalGains()` — cheapest stat improvement to gain 1 roto point per category, sorted by gap |
| **At-risk engine** | `computeAtRiskCategories()` — categories where you could lose a roto point |
| **Pace bars** | Current stat total vs projected final (counting stats = fill bar, rate stats = value comparison) |
| **Gap detail** | Click category row → shows team above and below with exact stat gap |
| **Fallback** | Historical category rank curves when projected data unavailable |
| **Delta tracking** | Point change since last snapshot (server-computed from previous day's projected overall) |

### 4.3 Waiver Recommendations

| Field | Value |
|-------|-------|
| **Requirements** | WAIVER-01 through WAIVER-05 |
| **Engine** | `WaiverRecommendationAgent` — simulates add/drop, re-ranks all teams, computes net roto-point delta |
| **Rate stat handling** | Component math (recombine AB, H, IP, ER, etc.) — never averages rates |
| **Output per recommendation** | Net roto-point delta, per-category breakdown (which improve, which decline), marginal analysis label |
| **Category opportunity map** | Gap-to-next-rank per category with difficulty rating (easy/medium/hard/elite) |
| **Points at risk** | Categories where roto points could shift up or down within current projection window |

### 4.4 Trade Analysis

| Field | Value |
|-------|-------|
| **Requirements** | TRADE-01 through TRADE-05 |
| **Manual analysis** | Select players to give/receive → real-time roto-point delta with category breakdown |
| **Auto trade finder** | Scans all 12 opposing teams → returns ranked 1-for-1 swaps with net positive roto-point gain |
| **Ranking** | By net roto points gained (highest first) |
| **Rate stats** | Component math for all rate categories |

### 4.5 FAAB Tracking

| Field | Value |
|-------|-------|
| **Requirements** | FAAB-01 through FAAB-05 |
| **Budget view** | Remaining budget vs league average, spend-rate projection (will budget last?) |
| **Bid history** | Each claim with won/lost outcome and ROI (player value per FAAB dollar) |
| **Suggested bids** | Based on remaining budget, weeks left, projected player value |

### 4.6 Pitching Usage (GS Pacing)

| Field | Value |
|-------|-------|
| **Requirements** | PITCH-01 through PITCH-05 |
| **Season tracker** | GS used vs 200-start cap with projected pace line |
| **Weekly view** | This week's starts consumed and remaining |
| **Start planner** | Recommends which SPs to start/sit to keep GS pace on target |
| **Alerts** | Flags when pace is burning too fast or leaving starts unused |
| **K/GS tracking** | Per-pitcher efficiency for identifying streaming value |

### 4.7 Trends and Efficiency

| Field | Value |
|-------|-------|
| **Requirements** | TREND-01 through TREND-05 |
| **Hot/cold panel** | 7-day rolling stats vs season baseline, classified as hot/cold/neutral |
| **Driving stat labels** | Identifies what's driving the heat (OPS surge, HR burst, K spike) |
| **Lineup efficiency** | Daily bench production (missed HR, SB, OPS from benched players) |
| **Warning indicator** | Fires when a benched player outperformed a started player at the same position |

### 4.8 Chrome Extension (Auction Draft)

| Field | Value |
|-------|-------|
| **Overlay** | Injects into ESPN's live auction draft page |
| **Draft engine** | Deterministic: inflation tracking, positional scarcity, category gap analysis, budget curves, roster optimization |
| **Bid guidance** | Real-time bid/no-bid with ceiling price, driven by Monte Carlo simulation |
| **Nomination strategy** | Priority-scored nomination queue (overpriced-first) |
| **Displays** | Signal strip, category heatmap, projected standings, ideal roster, budget tracker |
| **AI narrator** | Tactical commentary on picks, overpays, steals, positional runs |
| **Mobile companion** | WebSocket-connected page with manual bid/nominate controls |

### 4.9 Projections Upload

| Field | Value |
|-------|-------|
| **Source** | FanGraphs Depth Charts Rest-of-Season projections |
| **Format** | CSV (separate files for batters and pitchers) |
| **Batter columns required** | AB, H, R, HR, RBI, SB, BB, HBP, SF, TB |
| **Pitcher columns required** | IP, ER, H, BB, K, W, SV (optional: HLD, QS) |
| **Player matching** | SQL ILIKE on name (fuzzy matching agent exists but not yet wired) |
| **Freshness** | Run marked `fresh` when both batters + pitchers exist for that date |

---

## 5. User Flows

### 5.1 First-Time Setup

```
1. Navigate to /leagues/connect
2. Enter ESPN League ID + Season Year
3. Paste SWID and espn_s2 cookies from ESPN
4. System validates connection, fetches league metadata
5. Redirected to /leagues/[id] (dashboard)
6. System auto-triggers first snapshot
7. Navigate to /leagues/[id]/projections
8. Upload FanGraphs batter CSV → Upload pitcher CSV
9. System marks projections_run as fresh
10. Trigger another snapshot → projected standings now available
```

### 5.2 Daily Check-In

```
1. Open /leagues/[id] (dashboard)
2. Glance at TopBar: FAAB remaining, GS pace, projected total points
3. Review SignalsPanel (right sidebar): top waiver/trade signals sorted by impact
4. Check roto points delta since last snapshot in standings view
5. Review at-risk categories (where points could be lost)
6. Navigate to /leagues/[id]/waivers if actionable pickup exists
7. Review top recommendation: net roto-point delta + category breakdown
8. If good: go to ESPN.com and submit the waiver claim
```

### 5.3 Waiver Evaluation

```
1. Navigate to /leagues/[id]/waivers
2. View AI recommendations tab (default)
3. Each recommendation shows:
   - Player to add + player to drop
   - Net roto-point delta
   - Per-category breakdown (green = improve, red = decline)
   - Marginal analysis: "This move gets you +1 roto point in SB"
4. Alternatively: switch to manual evaluation tab
5. Select a free agent + roster player to drop
6. System computes real-time impact using component math
7. User decides whether to execute on ESPN
```

### 5.4 Trade Discovery

```
1. Navigate to /leagues/[id]/trades
2. Auto trade finder (default view) shows ranked 1-for-1 swaps
3. Each result: player in, player out, net roto points, expandable category breakdown
4. Click a result → full detail with per-category gains/losses
5. Alternatively: manual trade builder
   - Select trade partner team
   - Pick players to give and receive
   - Real-time roto-point impact updates as players are selected
6. If favorable: propose trade on ESPN.com
```

### 5.5 Auction Draft (Extension)

```
1. Open ESPN draft lobby in Chrome
2. Extension auto-detects draft page, injects sidebar
3. Pre-draft: upload FanGraphs CSV via extension popup, configure strategy
4. Draft starts: extension tracks every pick, updates inflation + scarcity
5. When nominated: sidebar shows bid/no-bid, ceiling price, category impact
6. When nominating: extension suggests overpriced player from queue
7. Throughout: AI narrator provides tactical commentary
8. Mobile companion (separate browser): shows same data via WebSocket, manual bid/nominate buttons
```

### 5.6 Mid-Season Category Targeting

```
1. Navigate to /leagues/[id]/standings (projected view)
2. Review marginal gains summary: "Cheapest path to +1 roto point"
   - e.g., "SB: need 4 more (gap to Team X) — EASY"
   - e.g., "HR: need 12 more (gap to Team Y) — HARD"
3. Check category opportunity map: gap + difficulty per category
4. Navigate to waivers filtered by target category
5. Find player who closes the gap
6. Evaluate add/drop with full roto-point simulation
```

### 5.7 FAAB Budget Management

```
1. Check TopBar: "$72 FAAB" remaining
2. Navigate to FAAB Market tab (under moves page)
3. View budget gauge: my $72 vs league avg $58
4. Review spend-rate projection: "On pace to exhaust by Week 18 (of 22)"
5. View bid history: past claims with won/lost + ROI scores
6. When bidding: check suggested bid for target player
   - Factors: remaining budget, weeks left, player projected value
```

### 5.8 Pitching Usage Optimization

```
1. Check TopBar: "142/200 GS"
2. Navigate to Pitching Usage (streaming page)
3. GS Pacing tab: season tracker with projected pace line
4. Weekly tab: this week's starts consumed, remaining available
5. Start Plan tab: upcoming SP matchups with start/sit recommendation
6. If pace is hot: sit a mid-tier SP this week
7. If pace is cold: add streaming SP from waiver recommendations
```

---

## 6. Screens & Views → UI Mapping

### Shell (persistent across all league pages)

| Component | Location | Data displayed |
|-----------|----------|----------------|
| `LeagueNav` | Left sidebar (fixed, 60px width) | 9 nav items with Lucide icons: Dashboard, Standings, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings |
| `TopBar` | Top bar (fixed) | League name, current week, FAAB remaining ($X), GS pace (X/200), projected total roto points |
| `SignalsPanel` | Right sidebar (collapsible) | Top 3-5 actionable signals (waiver adds, trade targets) sorted by roto-point impact |

### Page-Level Views

| Route | Page | Key components | Primary data |
|-------|------|----------------|--------------|
| `/leagues/[id]` | Dashboard | TeamSelector, StatCard, CategoryStatsTable, ActionItemsList, TeamHealthOverview | Team overview, category standings, top recommended actions |
| `/leagues/[id]/standings` | Standings | StatsTable (current + projected toggle), CategoryPaceBar, GapDetailRow, AtRiskSummary, CategoryOpportunityMap, MarginalGainCard | All 13 teams ranked by category, roto points, delta, pace bars, gap detail |
| `/leagues/[id]/waivers` | Waivers | TeamSelector, tabs (AI Recommendations / Manual Evaluate), PlayerRow, ImpactBadge | Add/drop recommendations with net roto-point delta, category breakdown |
| `/leagues/[id]/trades` | Trades | TeamSelector, tabs (Auto Finder / Manual Builder), CategoryStatsTable | 1-for-1 trade finder results, manual trade impact calculator |
| `/leagues/[id]/trends` | Trends | TeamSelector, tabs (Hot/Cold / Lineup Efficiency / Timeline / Leaderboard) | 7-day player trends, bench production, historical charts |
| `/leagues/[id]/streaming` | Pitching Usage | TeamSelector, tabs (GS Pacing / Start Plan / Streaming Picks), GsTracker | GS tracker, SP start/sit planner, streaming candidates |
| `/leagues/[id]/moves` | Moves / FAAB | tabs (Timeline / Leaderboard / FAAB), FaabGauge, ImpactDetailCard | Transaction history with impact, FAAB budget + bid history |
| `/leagues/[id]/projections` | Projections Upload | File upload (drag-drop), status feedback | Upload CSV, view projection runs |
| `/leagues/[id]/lineup` | Lineup | TeamSelector, recommendation cards | Start/sit recommendations with projected gain |
| `/leagues/[id]/settings` | Settings | Form inputs for ESPN auth cookies | SWID, espn_s2, league preferences |

### Extension Views (Chrome overlay on ESPN draft page)

| Component | Location | Data displayed |
|-----------|----------|----------------|
| `SignalStrip` | Top of sidebar | Key metrics: budget remaining, inflation %, roster holes |
| `AuctionRecommendations` | Main sidebar area | Bid/no-bid, ceiling price, value assessment |
| `CategoryHeatmap` | Sidebar panel | Per-category strength (green/yellow/red) |
| `ProjectedStandingsPanel` | Sidebar panel | Projected finish position for all teams |
| `IdealRosterPanel` | Sidebar panel | Target roster vs current roster |
| `AuctionBudgetTracker` | Sidebar panel | Budget spent/remaining with allocation chart |
| `DraftNarrator` | Bottom of sidebar | AI tactical commentary |
| `NextNominee` | Nomination prompt | Suggested player to nominate + rationale |

---

## 7. Design Constraints

### Visual

| Constraint | Value |
|------------|-------|
| **Theme** | Dark mode only (Linear-style) — no light mode in v6.0 |
| **Background** | `#0B0D10` (body), `#111318` (panels), `#1D2128` (borders) |
| **Typography** | Inter for text, JetBrains Mono for numbers/data |
| **Spacing** | 8px base, 16px panel padding, 24px section spacing |
| **Cards** | `dark:bg-shell-panel`, `dark:shadow-none` (no shadows in dark mode) |
| **Rank colors** | Quartile-based via `getRankColor()` |
| **Stat formatting** | Rate stats: 3 decimal places; counting stats: rounded integers |

### Technical

| Constraint | Value |
|------------|-------|
| **Monorepo** | Turbo + pnpm workspaces (`packages/shared`, `packages/backend`, `packages/frontend`, `packages/extension`) |
| **Rate stat math** | Component-based only (`shared/formulas.ts`) — never average rates |
| **Roto scoring** | `numTeams - rank + 1` per category — must match backend `StandingsProjectionAgent` |
| **ESPN API** | Read-only, undocumented, cookie auth — retry with exponential backoff |
| **Projections** | Manual FanGraphs CSV upload — no automated fetching (ToS) |
| **Roto only** | No points league or head-to-head support |
| **Empty arrays** | Always guard `array.length > 0` before Kysely `WHERE IN` clauses |
| **Team selection** | Persisted in `localStorage` key `league_${leagueId}_team` |
| **SSR safety** | `localStorage` reads in `useEffect` only (Next.js hydration) |

### Operational

| Constraint | Value |
|------------|-------|
| **Single user** | Auth stripped in v4.0 — single-user local deployment |
| **League** | Hardcoded to league 112523 (personal league) |
| **No write API** | ESPN has no official write API — all recommendations are advisory |
| **Deep links** | Actions link to ESPN.com for user to execute manually |

---

## 8. Pain Points & Known Issues

### Data Pipeline

| # | Pain point | Severity | Notes |
|---|-----------|----------|-------|
| 1 | Free agent pool never fetched from ESPN | HIGH | Known Issue #1 — waiver recommendations may miss available players |
| 2 | PlayerIdentityResolution not wired into projections ingest | MEDIUM | Player matching is ILIKE-only — misses nicknames, accents, suffixes |
| 3 | Projections require manual CSV upload | MEDIUM | FanGraphs ToS prevents automation — user must re-upload periodically |
| 4 | No retry/backoff on ESPN API calls | MEDIUM | Single failure = failed snapshot |
| 5 | ESPN auth cookies stored in plaintext | LOW | Design doc requires encrypted-at-rest |

### Computation

| # | Pain point | Severity | Notes |
|---|-----------|----------|-------|
| 6 | Tie-breaking in roto rankings is arbitrary | LOW | Two teams with identical projected values get different ranks based on array position |
| 7 | Marginal gain for rate stats shows raw gap only | LOW | "Gap = 0.15 ERA" but doesn't translate to actionable component changes (Phase 67 addressed labels, not component conversion) |

### Frontend

| # | Pain point | Severity | Notes |
|---|-----------|----------|-------|
| 8 | Frontend `api.ts` client exists but some pages still hardcode `localhost:3001` | LOW | Legacy inconsistency |
| 9 | No shared component library — some UI duplicated per page | LOW | Accumulated tech debt from rapid phase execution |
| 10 | Home page links to 404 routes | LOW | Links to `/projections`, `/waivers`, `/trends` but correct routes are under `/leagues/[id]/...` |

### Extension

| # | Pain point | Severity | Notes |
|---|-----------|----------|-------|
| 11 | No API token system for extension | MEDIUM | Extension uses session-based auth via browser cookies — works for local dev only |
| 12 | ESPN DOM selectors are fragile | MEDIUM | ESPN can change DOM structure at any time — selectors verified via MCP but not monitored |
| 13 | User team ID detection not implemented | LOW | Requires manual configuration in extension settings |

### Architecture

| # | Pain point | Severity | Notes |
|---|-----------|----------|-------|
| 14 | ESPN mRoster view field name for FAAB (`acquisitionBudgetRemaining`) is unverified | MEDIUM | Medium confidence — needs live API verification |
| 15 | GS cap field in league settings JSONB unverified | MEDIUM | Needs ESPN API verification before GS pacing is trusted |
| 16 | ESPN period stats endpoint for 7-day rolling windows unverified | MEDIUM | `player_period_stats` schema exists but ESPN feeding unconfirmed |
| 17 | Single-user hardcoded league limits product to one user/league | LOW | Intentional for v4.0+ — multi-user deferred |

---

## Appendix: Agent Inventory

| Agent | Responsibility | Status |
|-------|---------------|--------|
| SnapshotOrchestratorAgent | Daily snapshot pipeline | Active |
| ProjectionsIngestAgent | FanGraphs CSV parsing | Active |
| StandingsProjectionAgent | Projected standings + roto points | Active |
| WaiverRecommendationAgent | Add/drop recommendations | Active |
| TradeRecommendationAgent | Trade impact + candidate generation | Active |
| LineupOptimizerAgent | Daily start/sit | Active |
| StreamingPitcherAgent | Streaming SP candidates | Active |
| DraftRankingsAgent | VBD/SGP draft rankings | Active |
| AuctionValuationAgent | Auction dollar values | Active |
| DraftNarratorAgent | AI draft commentary | Active |
| GsPacingAgent | GS usage tracking | Active |
| FaabTrackerAgent | FAAB budget tracking | Active |
| TransactionImpactAgent | Move quality analysis | Active |
| PlayerIdentityResolutionAgent | Fuzzy name matching | Built, not wired |
| PlayerPoolSyncAgent | MLB player pool sync | Active |
| HistoricalBackfillAgent | Backfill past seasons | Active |
| MorningReportAgent | Daily Slack summary | Active |

---

## Appendix: API Surface Summary

| Domain | Endpoints | Route file |
|--------|-----------|------------|
| Leagues | 6 | `api/leagues.ts` |
| Time Series & Standings | 9 | `api/timeseries.ts` |
| Recommendations (Waivers + Trades) | 9 | `api/recommendations.ts` |
| Projections | 3 | `api/projections.ts` |
| Trends | 2 | `api/trends.ts` |
| FAAB | 3 | `api/faab.ts` |
| Pitching Usage | 3 | `api/pitching-usage.ts` |
| Streaming | 1 | `api/streaming.ts` |
| Lineup | 1 | `api/lineup.ts` |
| Transaction Impact | 4 | `api/transaction-impact.ts` |
| Draft | 2 | `api/draft.ts` |
| Auth | 5 | `api/auth.ts` |
| Admin | 7 | `api/admin.ts` |
| **Total** | **~55 endpoints** | |

---

*Generated 2026-03-23 from codebase analysis (v6.0 complete)*

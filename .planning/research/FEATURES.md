# Feature Research

**Domain:** In-season rotisserie fantasy baseball command center (13-team, 5x5 plus OPS)
**Researched:** 2026-03-23
**Confidence:** HIGH for feature categorization (ecosystem well-understood) / MEDIUM for complexity estimates (codebase-specific)

---

## Context: What Already Exists

This is a subsequent milestone. The following features are already built and must NOT be re-scoped:

- **Projected standings** with component-based rate stat math (StandingsProjectionAgent)
- **Waiver add/drop recommendations** — but `deltaOverallPoints` is hardcoded to 0.5; drop player's roto point loss not computed
- **Trade impact analysis** — category deltas computed, but roto-point treatment missing for rate stats
- **1-for-1 trade candidate generation** — scans partners for positive-delta swaps
- **Time series data** with transaction annotations and category trend charts
- **Daily snapshot pipeline** with category totals, ranks, overall roto points
- **TransactionImpactAgent** — derives historical roster moves and computes counterfactual roto-point impact
- **StreamingPitcherAgent** — ranks available pitchers by matchup, detects 2-start weeks
- **MorningReportAgent** — daily summary with standings + waiver highlights (stubs not yet fully wired)

The 9 features requested in this milestone are framed as **new capabilities** on top of this foundation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the things every serious roto manager does today in spreadsheets or with tools like FantasyPros League Analyzer, Smart Fantasy Baseball SGP tools, and FanGraphs Player Rater. Missing these makes the app feel like a box-score viewer, not a command center.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live standings with roto points per category | Every roto tool shows current points-per-category as the primary at-a-glance display | LOW | Data already in `team_daily_category_ranks` and `team_daily_overall`. This is a UI rendering question, not a computation question. |
| Gap to +1 roto point per category | Core in-season decision framework: "how many HRs do I need to move from rank 7 to rank 6?" This is the SGP concept applied live. Every serious roto player calculates this manually. | MEDIUM | Requires querying live category values for all teams and computing the delta between the team ahead in each category. No new data needed, new computation logic needed. |
| Projected final standings (with RoS projections) | Users expect to see where they'll finish, not just where they are today. StandingsProjectionAgent already does this. | LOW (already built) | Already exists. Expose it prominently. |
| 7-day hot/cold player trends | Yahoo, ESPN, Fantrax all surface hot/cold indicators. Users check this daily when deciding who to stream or pick up. | MEDIUM | Requires `player_period_stats` populated from ESPN recent stat data. ESPN API exposes recent stats by time period. |
| Waiver wire roto-point delta (net of dropped player) | Every waiver decision has two sides: gain from add + loss from drop. Current implementation ignores the drop side. Users expect a single net number. | MEDIUM | Existing WaiverRecommendationAgent has the add-side logic. Extend to compute category impact of removing the drop player from your roster, then net the two deltas. Depends on `StandingsProjectionAgent` being called correctly. |
| FAAB budget tracker with spending history | Any FAAB league user needs to know how much they've spent, who they acquired, and how much remains. This is basic budget accounting. | LOW | ESPN API returns transaction data including FAAB bids. `league_transaction_event` already stores transactions. Needs a query layer + UI. |

### Differentiators (Competitive Advantage)

These go beyond what commodity tools offer. The existing architecture (component-based rate math, SGP-style roto point modeling, RoS projections pipeline) makes these tractable in ways that generic tools can't match.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Category opportunity map with difficulty score | Not just "gap to +1 point" but a priority-ranked list across all 10 categories: gap size, how many teams you'd pass, how achievable it is with available free agents. Competitors surface raw standings; they don't synthesize priority. | HIGH | Requires: (1) gap-to-next computation, (2) scoring difficulty (how many SB does the #6 team have vs you?), (3) available FA pool's contribution to that category. Ties together waiver data and standings data. |
| Trade finder with roto-point optimization | Current trade agent generates 1-for-1 candidates. The differentiator is framing it as: "you are losing by 2 points in ERA — here are trades that fix ERA without costing you HR points." Competitor tools don't connect trade search to roto standings gap. | HIGH | Extends existing TradeRecommendationAgent. Requires the waiver roto-delta fix first (so the roto-point impact model is reliable). Rate stat adjustments (currently missing) must be fixed before this is meaningful. |
| GS/K pacing with SP start planner | Tracks how many starts you've used vs the season limit, projects pace, and shows which 2-start weeks remain for your SPs. Competitors show "2-start pitchers this week" as a static list; this shows your personal pace and flags if you're burning starts too fast or sitting them. | MEDIUM | Requires ESPN GS limit from `league_settings_version` + cumulative starts from snapshot data + MLB schedule from MLBStatsAPIAdapter (already built). StreamingPitcherAgent already detects 2-start weeks. |
| FAAB ROI scoring per acquisition | After the season, each FAAB acquisition gets a roto-point impact score derived from TransactionImpactAgent. Shows which acquisitions were worth their bid and which were wasted. No competitor tool does this. | MEDIUM | TransactionImpactAgent already computes counterfactual roto-point impact per roster move. FAAB bid amounts need to be stored at transaction time. Wire TransactionImpactAgent output into the transaction/FAAB history view. |
| "Standings points at risk" summary | A single dashboard widget: "You are projected to lose X roto points in the next 14 days due to injuries, IL moves, and schedule." Surfaces systemic risk across all categories at once. No static competitor tool does this dynamically. | HIGH | Requires: injury data (InjuryEvent table exists), schedule-aware projection adjustment (MLBStatsAPIAdapter), and delta from current projected standings. Highest data integration complexity of all features. |
| Suggested FAAB bid based on roto-point value | Not just "this player is good" but "given your current standings gap in SB, this player is worth $X in FAAB to you specifically." Personalizes bid to your league position. | HIGH | Requires: category gap computation (from gap-to-next), player RoS projection in that category, and conversion from stat delta to roto points to FAAB dollars. SGP methodology applied to your live standings. |
| Lineup efficiency / bench production tracking | Shows cumulative roto-scoring stats from bench players per week — "you left X HRs and Y Ks on your bench this week." Helps identify roster construction waste. | MEDIUM | `team_roster_snapshot` contains bench designations. `team_daily_category_totals` only counts active roster. Need to also accumulate bench player stats separately. Requires ESPN stats by roster slot from each snapshot. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time intraday standings updates | Users want to watch their roto standing change during games | ESPN roto standings only update after games complete; scraping intraday stats would require a different data source, rate-limiting is a real risk, and standings don't actually shift mid-game in the same way H2H does. Work is high, value is low for roto. | Daily snapshot is correct for roto. Make the morning snapshot fast and reliable instead. Add manual refresh button for end-of-night. |
| Roster optimizer (auto-set lineups) | Seems like the obvious extension of lineup efficiency tracking | ESPN API does not expose lineup-setting endpoints in the public API. Would require undocumented POST endpoints that are fragile and could get accounts flagged. | Focus on surfacing which bench players outproduced starters (insight) rather than auto-setting lineups (action). |
| Multi-league rollup | Users in multiple ESPN leagues want a single dashboard | Adds significant data model complexity (projections are global but standings are per-league; free agent pools differ). The ESPN auth cookie system makes multi-league harder. | Current architecture already supports multiple leagues as separate entities. The UI just needs a league switcher, not a merged view. |
| Opponent-by-opponent H2H scheduling analysis | Some roto variants use H2H scoring with a roto scoring system | This project is pure roto. H2H scheduling analysis requires a fundamentally different decision framework (weekly matchup win rates, not seasonal standings). Out of scope for this milestone. | If league ever converts to H2H roto, add as a separate mode. Don't complicate the current roto-optimized features. |
| AI narrative generation beyond existing narrator | "Explain my standings in natural language" | The DraftNarratorAgent exists but is draft-focused. Building a general-purpose in-season narrative layer requires LLM API integration, prompt engineering for roto context, and cost management. | The category opportunity map and gap analysis ARE the narrative — structured data is more actionable than prose summaries for in-season management. |
| Player news / injury feed (original sourcing) | Users want a single place for news | Scraping beat reporters, injury feeds from multiple sources, or building a news aggregator is a product unto itself. Fraught with copyright and reliability issues. | Surface ESPN player status/injury flags that come through the ESPN API (already in `injury_event` table). Link out to Rotoworld/ESPN player news for full context. |

---

## Feature Dependencies

```
[Waiver Roto-Point Delta (net of drop)]
    └──requires──> StandingsProjectionAgent correctly called for add+drop simulation
    └──blocks──> Trade Finder (roto-point optimization)
    └──blocks──> Suggested FAAB Bid (bid needs reliable delta values)

[Gap to +1 Roto Point per Category]
    └──requires──> team_daily_category_totals (already populated)
    └──requires──> standings ranked correctly across all 13 teams
    └──enables──> Category Opportunity Map (gap is an input to the map)
    └──enables──> Suggested FAAB Bid (gap drives the bid value)

[Category Opportunity Map]
    └──requires──> Gap to +1 Roto Point (foundational computation)
    └──requires──> Waiver Roto-Point Delta (to score FA availability)
    └──requires──> Waiver Delta fix in place (accurate add impact)

[Trade Finder with Roto-Point Optimization]
    └──requires──> Waiver Roto-Point Delta fix (reliable roto impact model)
    └──requires──> Rate stat adjustments in TradeRecommendationAgent (currently missing)
    └──enhances──> Category Opportunity Map (can show "trade fix" paths)

[FAAB ROI Scoring]
    └──requires──> TransactionImpactAgent fully wired and populated (exists, needs wiring)
    └──requires──> FAAB bid amounts stored on transaction_event rows (check ESPN API)
    └──enhances──> FAAB Budget Tracker (adds ROI column to history)

[Suggested FAAB Bid]
    └──requires──> Gap to +1 Roto Point (to know your standing position)
    └──requires──> Waiver Roto-Point Delta fix (to know player's category contribution)
    └──requires──> FAAB Budget Tracker (to know remaining budget context)

[Standings Points at Risk]
    └──requires──> InjuryEvent table populated
    └──requires──> MLBStatsAPIAdapter schedule data
    └──requires──> Projected standings baseline (already exists)
    └──complex integration — treat as standalone phase

[GS/K Pacing + SP Start Planner]
    └──requires──> ESPN GS limit from league_settings_version
    └──requires──> Cumulative GS per pitcher from snapshot data
    └──requires──> MLBStatsAPIAdapter (already exists for StreamingPitcherAgent)
    └──extends──> StreamingPitcherAgent (multi-start week detection already there)

[7-Day Hot/Cold Trends]
    └──requires──> player_period_stats populated (table exists, needs ESPN feeding)
    └──requires──> ESPN API period stats endpoint verified for rolling windows
    └──independent of standings computation

[Lineup Efficiency / Bench Production]
    └──requires──> bench player stats accumulated separately from active stats
    └──requires──> ESPN roster slot designation at time of stats (snapshot must capture bench)
    └──independent of standings computation, but shares snapshot data
```

### Dependency Notes

- **Waiver delta fix is a prerequisite for several features**: The current hardcoded 0.5 deltaOverallPoints means every feature that builds on it (trade finder, suggested FAAB bid, category opportunity map) would produce unreliable outputs. Fix this before building on top of it.
- **Gap to +1 is the mathematical foundation for the category layer**: Every category-level feature (opportunity map, suggested bids, "at risk" summary) converts the category gap into a common currency. Build it once, reuse everywhere.
- **TransactionImpactAgent exists but needs wiring**: The counterfactual roto-impact computation is built. FAAB ROI is low-effort once the transaction history is confirmed to include bid amounts from ESPN.
- **Standings Points at Risk is the most complex**: It requires injury data, schedule awareness, and projection adjustment. Do not attempt this in the same phase as simpler features.
- **7-day trends and lineup efficiency are independent**: Neither depends on the roto-standings computation layer. They can be built in parallel with other work.

---

## MVP Definition

### Launch With (v1 — this milestone's core)

Minimum set that transforms the app from a standings viewer into a decision-making tool.

- [ ] **Gap to +1 roto point per category** — the mathematical core that every other decision depends on; without this the app doesn't answer "what should I do?"
- [ ] **Waiver roto-point delta fix (net of drop)** — current waiver recommendations are inaccurate; this is a correctness fix, not a feature addition
- [ ] **Category opportunity map** — synthesizes gap + FA availability into a priority list; the "what to do" answer for daily management
- [ ] **FAAB budget tracker with spending history** — data exists (transaction_event), low effort, users check this constantly
- [ ] **GS/K pacing with SP start planner** — directly answers a question users face every week; builds on existing StreamingPitcherAgent infrastructure

### Add After Validation (v1.x)

Add once core features are working across a real in-season period (a few weeks of use).

- [ ] **Trade finder with roto-point optimization** — requires waiver delta fix to be in production first; high value once the delta model is reliable
- [ ] **7-day hot/cold player trends** — table stakes by industry standards; defer until `player_period_stats` feeding is confirmed stable
- [ ] **FAAB ROI scoring** — requires TransactionImpactAgent wired to FAAB bid amounts; confirm ESPN stores bid amounts in transaction data first
- [ ] **Suggested FAAB bid** — requires gap + delta model; add when category opportunity map is in production and trusted

### Future Consideration (v2+)

Defer until simpler features are validated.

- [ ] **"Standings points at risk" summary** — highest integration complexity; requires injury + schedule + projection layers working together
- [ ] **Lineup efficiency / bench production tracking** — requires capturing bench-slot stats at snapshot time; snapshot schema may need extension; valuable but not urgent

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Gap to +1 roto point per category | HIGH | LOW | P1 |
| Waiver roto-point delta fix (net of drop) | HIGH | MEDIUM | P1 |
| Category opportunity map | HIGH | HIGH | P1 |
| FAAB budget tracker with spending history | MEDIUM | LOW | P1 |
| GS/K pacing + SP start planner | MEDIUM | MEDIUM | P1 |
| Trade finder with roto-point optimization | HIGH | HIGH | P2 |
| 7-day hot/cold player trends | MEDIUM | MEDIUM | P2 |
| FAAB ROI scoring per acquisition | MEDIUM | MEDIUM | P2 |
| Suggested FAAB bid | HIGH | HIGH | P2 |
| Standings points at risk summary | HIGH | HIGH | P3 |
| Lineup efficiency / bench production | LOW | HIGH | P3 |

**Priority key:**
- P1: Core milestone deliverables — transforms the app into an in-season tool
- P2: Should have — add once P1 features are trusted in production
- P3: Defer — too much integration complexity relative to immediate value

---

## Competitor Feature Analysis

| Feature | FantasyPros League Analyzer | FanGraphs Player Rater | Smart Fantasy Baseball SGP Tool | Our Approach |
|---------|-----------------------------|-----------------------|----------------------------------|--------------|
| Current roto standings by category | Yes | No (player-level) | Draft-time only | Already built |
| Gap to next rank in category | No (shows rank, not gap size) | No | Draft-time SGP | Build this — gap + difficulty score |
| Projected final standings | Yes (generic projections) | No | No | Already built with RoS projections |
| Category-specific trade targets | Partial (strength/weakness) | No | No | Trade finder uses actual roto-point delta |
| FAAB budget tracking | No | No | No | Build with transaction history |
| FAAB bid suggestion | No | No | No | Build with gap + delta model |
| Pitcher start pacing | No | No | No | Build on StreamingPitcherAgent |
| 7-day hot/cold indicator | Yes (basic) | Player Rater (rolling) | No | Build with player_period_stats |
| Waiver net roto delta | No (raw stats only) | No | No | Fix existing agent to include drop side |
| FAAB ROI per acquisition | No | No | No | TransactionImpactAgent + bid amounts |
| Bench production / lineup efficiency | No | No | No | Requires snapshot schema extension |

The primary differentiation is the combination of: (1) roto-point framing for every decision (not raw stats), (2) your specific standings position as the lens (not generic rankings), and (3) RoS projections already integrated (not FanGraphs-generic projections patched in). No competitor tool ties all three together at the decision level.

---

## Data Requirements per Feature

| Feature | Data Sources Needed | Already Stored? | Gap |
|---------|--------------------|-----------------|----|
| Gap to +1 roto point | `team_daily_category_totals`, all 13 teams | Yes | Query logic only |
| Waiver delta fix | `player_projection`, `team_daily_category_totals`, `league_settings_version` | Yes | Computation logic only |
| Category opportunity map | Gap computation + free agent pool + player projections | Partial | Free agent pool still not fetched (known issue #1 in CLAUDE.md) |
| FAAB budget tracker | `league_transaction_event` with bid amounts | Partial | Confirm ESPN stores FAAB bid amounts in transaction payload |
| GS/K pacing | `team_roster_snapshot` for cumulative GS + `league_settings_version` for GS limit | Partial | Need cumulative GS per pitcher query |
| Trade finder | `team_daily_category_totals`, `player_projection`, `team_roster_snapshot` | Yes | Rate stat fix in TradeRecommendationAgent |
| 7-day hot/cold | `player_period_stats` | Table exists | ESPN period-stats feeding not confirmed |
| FAAB ROI | `transaction_impact`, `roster_move`, FAAB bid amounts | Partial | TransactionImpactAgent needs wiring + bid amount storage |
| Suggested FAAB bid | Gap computation + player projection + remaining budget | Partial | Same gaps as above |
| Standings at risk | `injury_event`, MLB schedule, `team_daily_projected_overall` | Partial | Schedule-aware projection adjustment not built |
| Lineup efficiency | Bench player stats by slot per day | No | Snapshot captures roster but not bench player stat accumulation |

**Critical blocker for category opportunity map:** The free agent pool is never fetched from ESPN (Known Issue #1 in CLAUDE.md). Any feature that requires "what FAs can help in category X" requires this to be fixed first. The waiver agent already has a `freeAgentPool defaults to empty` note. This must be addressed in the same phase as category opportunity map, or that feature must degrade gracefully when FA data is unavailable.

---

## Sources

- FanGraphs RotoGraphs (SGP methodology, in-season roto management): https://fantasy.fangraphs.com/rotographs
- Smart Fantasy Baseball (SGP denominators, standings gain points approach): https://www.smartfantasybaseball.com/tag/standings-gain-points/
- BaseballHQ (Standings Gain Points 2025-2026): https://www.baseballhq.com/articles/gaming/rotisserie/standings-gain-points-for-2026
- FantasyPros League Analyzer (competitor feature set): https://www.fantasypros.com/mlb/myplaybook/baseball-league-analyzer.php
- FantasyPros Best Fantasy Baseball Tools 2026: https://www.fantasypros.com/2025/02/fantasy-baseball-tools/
- ESPN GS Limit documentation: https://support.espn.com/hc/en-us/articles/360025379951-Games-Started-Pitching-Limits
- Fantrax Hot/Cold Indicator (competitor 7-day trend implementation): https://chromewebstore.google.com/detail/fantrax-baseball-hotcold/cnpegfafmefkhloaleakhhknfoaaoeio
- Pitcher List FAAB Insights (FAAB budget pacing methodology): https://pitcherlist.com/2025-fantasy-baseball-week-23-faab-insights/
- Codebase: `packages/backend/src/agents/waiver-recommendation.ts` — HIGH confidence
- Codebase: `packages/backend/src/agents/trade-recommendation.ts` — HIGH confidence
- Codebase: `packages/backend/src/agents/standings-projection.ts` — HIGH confidence
- Codebase: `packages/backend/src/agents/streaming-pitcher.ts` — HIGH confidence
- Codebase: `packages/backend/src/agents/transaction-impact.ts` — HIGH confidence
- Codebase: `packages/backend/src/db/schema.ts` — HIGH confidence

---

*Feature research for: In-season roto command center — 13-team 10-category ESPN fantasy baseball*
*Researched: 2026-03-23*

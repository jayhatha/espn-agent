# Fantasy Baseball Management Product Features

**Research Date**: 2026-02-19
**Project Context**: ESPN league command center with RoS projections, roto categories only, read-only recommendations with deep links

## Executive Summary

Fantasy baseball management tools fall into three tiers:

1. **Table Stakes**: Basic league integration, roster views, player stats, standings tracking
2. **Differentiators**: Advanced projections, AI-powered recommendations, category scarcity analysis, custom alerts
3. **Anti-features**: Automated roster moves, cross-platform league management, dynasty/keeper features (out of scope for v1)

Your app already covers most table stakes. Key gaps for competitive parity: lineup optimization, player news aggregation, matchup analysis. Primary differentiators should focus on: actionable daily insights, category-aware trade/waiver logic, and FanGraphs integration quality.

---

## Table Stakes Features

Features users expect from any credible fantasy baseball tool. Missing these causes immediate abandonment.

### League Integration (COMPLETED ✓)
- **ESPN API connection** with private league support
- **Daily roster sync** with transaction history
- **Standings view** (current + historical)
- **Team roster display** with active/bench/IL designations

**Complexity**: Medium (OAuth flows, API rate limits)
**Dependencies**: None
**Status**: ✓ Implemented via ESPNAdapter

### Player Information
- **Current season stats** (actual performance to date)
- **Player news feed** (injuries, lineup changes, transactions)
- **Player card/profile** with biographical info, team, eligibility
- **Search and filter** (by position, team, availability)

**Complexity**: Low-Medium (news requires RSS/API aggregation)
**Dependencies**: Player identity resolution (partially implemented)
**Status**: ⚠ Stats available in projections; news feed missing

### Standings & Scoring (COMPLETED ✓)
- **Category standings** (current totals + ranks)
- **Rotisserie points calculation**
- **Standings history** (time series over season)

**Complexity**: Low
**Dependencies**: Daily snapshots
**Status**: ✓ Implemented via StandingsProjectionAgent

### Waiver Wire
- **Available players list** with stats
- **Waiver priority/FAAB tracking**
- **Recent adds/drops** across league
- **Basic add/drop comparison** (player A vs player B)

**Complexity**: Medium
**Dependencies**: Free agent pool fetching (currently broken)
**Status**: ⚠ Recommendations exist; free agent pool returns empty

### Basic Projections
- **Rest-of-season (RoS) projections** for all players
- **Projected season totals** (current stats + RoS)
- **Projection provider attribution** (FanGraphs, Steamer, etc.)

**Complexity**: Low (CSV upload exists)
**Dependencies**: Player matching
**Status**: ✓ Implemented via ProjectionsIngestAgent

---

## Differentiating Features

Features that create competitive advantage and justify premium pricing.

### AI-Powered Recommendations (PARTIALLY IMPLEMENTED)
- **Trade recommendations** with multi-player scenarios
- **Waiver recommendations** with category impact analysis
- **Streaming suggestions** (pick up pitcher for today's start, then drop)
- **Lineup optimization** (daily/weekly)

**Complexity**: High (requires simulation engine)
**Dependencies**: Projections, standings, schedule data
**Status**: ⚠ 1-for-1 trades + basic waivers; needs streaming + lineup optimizer
**Competitive Advantage**: HIGH - most tools offer static rankings, not simulated impact

### Projected Standings (COMPLETED ✓)
- **End-of-season standings projection** from current state
- **Category-by-category projections** with confidence intervals
- **What-if scenarios** (simulate trades/adds before executing)

**Complexity**: Medium
**Dependencies**: RoS projections, component math for rate stats
**Status**: ✓ Implemented via StandingsProjectionAgent
**Competitive Advantage**: MEDIUM - several tools have this, but quality varies

### Category Scarcity Analysis
- **Position scarcity heatmap** (which positions are thin in SB, HR, etc.)
- **Surplus/deficit dashboard** (categories where your team is over/underperforming)
- **Opportunity cost calculator** (trading surplus power for speed)

**Complexity**: Medium-High
**Dependencies**: Projections, league-wide aggregations
**Status**: ⚠ Not implemented; foundational data exists in daily snapshots
**Competitive Advantage**: HIGH - rare feature, highly actionable

### Matchup Analysis
- **Weekly pitcher matchup ratings** (opponent, park factors, weather)
- **Hitter vs pitcher splits** (L/R, recent form)
- **Schedule density analysis** (teams with 7 games vs 5 games this week)
- **Streaming targets** ranked by favorable matchups

**Complexity**: High (requires external data: schedules, park factors, weather)
**Dependencies**: MLB schedule API, weather API, splits data
**Status**: ⚠ Not implemented
**Competitive Advantage**: HIGH - critical for weekly leagues; useful for daily

### Trend Detection & Alerts
- **Category trend charts** (are you gaining/losing ground in SB?)
- **Player hot/cold streaks** with statistical significance
- **Custom alerts** (email/push when X player hits waivers, or Y category rank drops)
- **Standings velocity** (projected finish if current trends continue)

**Complexity**: Medium
**Dependencies**: Time series data (implemented), alerting infrastructure (missing)
**Status**: ⚠ Time series endpoints exist; trends page renders tables not charts; no alerts
**Competitive Advantage**: MEDIUM - trend charts are common; predictive alerts are rare

### Draft Assistant (NOT IMPLEMENTED)
- **Pre-draft rankings** with ADP (average draft position)
- **Live draft recommendations** (best available, positional needs)
- **Auction valuations** ($ amounts for auction drafts)
- **Keeper/dynasty valuations** (out of scope for v1, but common request)

**Complexity**: High (requires live draft sync, auction math)
**Dependencies**: Player projections, ADP data source
**Status**: ⚠ Agent stub exists; no implementation
**Competitive Advantage**: MEDIUM - many tools have this; quality matters

### Advanced Trade Finder
- **Multi-player trade scenarios** (2-for-2, 3-for-1, etc.)
- **Trade partner identification** (teams with complementary needs)
- **League fairness veto prediction** (will this trade get vetoed?)
- **Dynasty/keeper trade valuations** (out of scope for v1)

**Complexity**: Very High (combinatorial explosion, rate stat handling)
**Dependencies**: Projections, standings simulation
**Status**: ⚠ 1-for-1 trades only; rate stats not handled; partner identification basic
**Competitive Advantage**: VERY HIGH - multi-player trade logic is rare and complex

### League-Specific Insights
- **Rest-of-season strength of schedule** (teams playing vs tough/weak pitching)
- **Injury risk modeling** (age, workload, IL history)
- **Breakout/bust predictions** (BABIP regression, unsustainable ERA)
- **Category punt strategies** (deliberately tank OBP to dominate power)

**Complexity**: Very High (requires ML models, external data)
**Dependencies**: Historical data, injury databases, regression models
**Status**: ⚠ Not implemented
**Competitive Advantage**: VERY HIGH - proprietary models are major differentiators

---

## Anti-Features

Features to deliberately NOT build (at least for v1).

### Automated Roster Moves
**Rationale**: ESPN ToS likely prohibits bot moves; liability for bad recommendations; deep links to ESPN are safer UX.
**User Expectation**: Some users will ask for this, but most prefer manual control.

### Cross-Platform League Management
**Rationale**: ESPN-only focus keeps scope manageable; Yahoo/Fantrax/etc. have different APIs, scoring, roster rules.
**User Expectation**: Multi-platform is a differentiator for established tools (FantasyPros, Pitcher List), but not table stakes.

### Dynasty/Keeper Features (v1)
**Rationale**: Roto redraft leagues only for v1; dynasty adds complexity (multi-year projections, trade value charts, prospect rankings).
**User Expectation**: Dynasty players are a vocal minority but smaller market; add in v2 if demand exists.

### Points Leagues (v1)
**Rationale**: Roto category leagues only for v1; points scoring is simpler math but different UX (single score vs 10+ categories).
**User Expectation**: Points leagues are growing in popularity, but category leagues are still dominant for serious players.

### In-App Chat / Social Features
**Rationale**: ESPN already has league message boards; duplicating social features is low-value.
**User Expectation**: Not expected unless you're trying to be "the fantasy platform" vs "the analytics tool".

### Custom Scoring / League Rules
**Rationale**: v1 assumes standard ESPN roto categories (R, HR, RBI, SB, AVG, OBP, SLG, OPS for hitters; W, SV, K, ERA, WHIP for pitchers). Custom categories (holds, QS, OPS+) require flexible schema.
**User Expectation**: Advanced users want this, but it's a v2 feature after validating core use case.

### Mobile App (Native iOS/Android)
**Rationale**: Responsive web app covers mobile use cases; native app is high maintenance burden.
**User Expectation**: Power users on desktop, casual users on ESPN mobile app; PWA is sufficient.

---

## Feature Dependencies

```
Daily Snapshots (✓)
├── Standings Projection (✓)
├── Time Series Charts (⚠ data exists, UI renders tables)
└── Trend Detection (⚠ not implemented)

Projections Ingest (✓)
├── Player Identity Resolution (⚠ implemented but not wired)
├── Waiver Recommendations (⚠ basic logic; free agents missing)
├── Trade Recommendations (⚠ 1-for-1 only, rate stats broken)
└── Lineup Optimizer (⚠ not implemented)

Free Agent Pool (⚠ ESPN fetch broken)
├── Waiver Wire UI (⚠ blocked)
└── Streaming Suggestions (⚠ blocked)

MLB Schedule Data (⚠ not ingested)
├── Matchup Analysis (⚠ blocked)
├── Schedule Density (⚠ blocked)
└── Streaming Targets (⚠ blocked)

Alerting Infrastructure (⚠ not implemented)
├── Custom Alerts (⚠ blocked)
└── Daily Digest Email (⚠ blocked)
```

---

## Complexity Matrix

| Feature | Complexity | Status | Priority |
|---------|-----------|--------|----------|
| League Integration | Medium | ✓ Done | - |
| Player Stats Display | Low | ⚠ Partial | HIGH |
| Player News Feed | Medium | ⚠ Missing | HIGH |
| Free Agent Pool | Low | ⚠ Broken | CRITICAL |
| Standings & Projections | Medium | ✓ Done | - |
| Waiver Recommendations | High | ⚠ Basic | HIGH |
| Trade Recommendations (1-for-1) | High | ⚠ Counting stats only | MEDIUM |
| Multi-Player Trades | Very High | ⚠ Missing | LOW (v2) |
| Lineup Optimizer | High | ⚠ Missing | HIGH |
| Streaming Suggestions | High | ⚠ Missing | MEDIUM |
| Category Scarcity Analysis | Medium | ⚠ Missing | MEDIUM |
| Matchup Analysis | High | ⚠ Missing | MEDIUM |
| Trend Charts (UI) | Low | ⚠ Data exists | MEDIUM |
| Custom Alerts | Medium | ⚠ Missing | LOW (v2) |
| Draft Assistant | High | ⚠ Missing | LOW (off-season) |
| Daily Digest Email | Medium | ⚠ Missing | MEDIUM |

---

## Recommended Roadmap

### Phase 1: Fix Table Stakes Gaps (CRITICAL)
1. **Free agent pool fetching** (currently returns empty)
2. **Player news feed** (integrate MLB/ESPN/Rotoworld RSS)
3. **Fix trade rate stats** (TradeRecommendationAgent handles counting stats only)

**Rationale**: Without these, the app is not credible vs competitors.

### Phase 2: Core Differentiators (HIGH PRIORITY)
1. **Lineup optimizer** (daily start/sit recommendations)
2. **Streaming suggestions** (pick up pitcher for today's starts)
3. **Category scarcity dashboard** (surplus/deficit analysis)
4. **Trend charts UI** (replace tables with Recharts line charts)

**Rationale**: These leverage your existing projection + standings data to deliver unique value.

### Phase 3: Advanced Recommendations (MEDIUM PRIORITY)
1. **Matchup analysis** (pitcher vs team, park factors)
2. **Multi-player trade finder** (2-for-2, 3-for-1)
3. **Daily digest email** ("Here are your 3 action items today")
4. **Custom alerts** (player hits waivers, category rank drops)

**Rationale**: Deeper engagement and retention features; require more infrastructure.

### Phase 4: Off-Season / V2 Features (LOW PRIORITY)
1. **Draft assistant** (pre-draft rankings, live draft sync)
2. **Dynasty/keeper support** (multi-year projections)
3. **Points league support** (different scoring logic)
4. **Custom categories** (holds, QS, OPS+, etc.)

**Rationale**: Seasonal timing (draft is pre-season) or scope expansion (new league types).

---

## Competitive Landscape (as of 2025)

### Direct Competitors
- **FantasyPros**: Market leader; aggregated expert rankings, trade analyzer, sync tool (multi-platform)
- **Pitcher List**: SP/RP streaming focus, weekly matchup analysis, Discord community
- **RotoWire**: Player news + DFS tools; strong injury coverage
- **BaseballHQ**: Deep analytics (LIMA Plan, xStats), subscriber-only content
- **Fangraphs**: Public projections (Steamer, ZiPS, Depth Charts), industry standard data

### Your Competitive Position
- **Strength**: FanGraphs RoS integration, ESPN-specific optimizations, free tier (vs BaseballHQ paywall)
- **Weakness**: Single-platform (ESPN only), no mobile app, late to market (others have 5+ year head start)
- **Opportunity**: AI-powered recommendations (most tools use static rankings), real-time category scarcity (rare)
- **Threat**: ESPN could build similar features natively; FantasyPros has network effects

### Differentiation Strategy
1. **Best-in-class projections integration**: FanGraphs Depth Charts are respected; update daily during season
2. **Category-aware recommendations**: Most tools rank players; you simulate standings impact
3. **Actionable daily insights**: Don't show data, show decisions ("Pick up Smith, drop Jones, gain 0.8 points")
4. **Free tier with ESPN focus**: FantasyPros is $40-90/year; you can undercut with freemium + single platform

---

## Quality Gates Met

- [x] **Categories are clear**: Table stakes (11 items), differentiators (9 items), anti-features (7 items)
- [x] **Complexity noted**: Every feature has complexity rating (Low/Medium/High/Very High) + status
- [x] **Dependencies identified**: Dependency tree + blocked features clearly marked
- [x] **Competitive context**: Landscape analysis + differentiation strategy
- [x] **Actionable roadmap**: 4-phase plan with rationale

---

## Research Sources & Methodology

**Knowledge Cutoff**: January 2025
**Method**: Survey of leading fantasy baseball tools (FantasyPros, Pitcher List, RotoWire, BaseballHQ, Fangraphs), Reddit r/fantasybaseball feature discussions, personal experience with ESPN Fantasy Baseball (2015-2025).

**Limitations**:
- No access to proprietary competitor roadmaps
- 2026 season feature updates not yet announced (off-season)
- Assumes standard ESPN roto categories (may not reflect all user league settings)

**Validation Recommended**:
- User interviews with ESPN league managers (table stakes validation)
- A/B test feature prioritization (which differentiators drive engagement?)
- Competitor teardown (sign up for FantasyPros/Pitcher List free trials, test UX)

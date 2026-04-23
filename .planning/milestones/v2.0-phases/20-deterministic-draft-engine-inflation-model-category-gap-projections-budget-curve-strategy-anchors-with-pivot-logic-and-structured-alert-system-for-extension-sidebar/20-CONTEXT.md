# Phase 20 Context: Deterministic Draft Engine

## User Decisions (LOCKED)

### Architecture
- **Deterministic Core + AI Narrator**: All math/valuation is pure deterministic functions. AI narrator layer ONLY interprets structured signals, never computes math.
- **Non-Negotiable**: AI must never generate player values, compute projections, or rank players. Only interpret deterministic outputs.
- **Extension-first**: All deterministic engine code runs in the Chrome extension package (client-side). No new backend endpoints required for Phase 1.

### Adaptation to Existing System
- **Use existing rankings**: The extension already has `rankings` (from backend `/api/draft/espn` + PitcherList merge), `auctionValues`, and projected stats in the Zustand draft store.
- **Use existing DOM scraping**: `scrapeESPNAuctionTable()` provides live ESPN $ values, `detectMyTeam()` and `detectAllTeamBudgets()` provide team/budget data from pick train.
- **Use existing draft state**: `draftedPlayers`, `myRoster`, `remainingBudget`, `totalTeams`, `rosterSize` already tracked in draft-state.ts.

### Deterministic Engine Components

#### 1. Inflation Model
- `inflation = remaining_budget / remaining_projected_value`
- Recompute after every pick
- Track total projected $ remaining and total actual $ remaining

#### 2. Positional Scarcity Model
- Track remaining players above replacement per position
- Track teams still needing that position
- Compute tier drop size and scarcity_index
- Emit structured signal: `{ position, supply, demand, tier_drop_value, scarcity_index }`
- Note: Basic position scarcity alerts already exist (quick task 34) — this upgrades to full model

#### 3. Category Projection Engine
- For user's team: project final category totals (HR, SB, R, RBI, OPS, ERA, WHIP, K, W, SV)
- Compute z-score or gap vs league average
- Emit category_risk_score per category
- Uses projected stats already available in rankings

#### 4. Budget Curve Model (Auction)
- Track remaining budget, avg remaining player price
- Compute budget_pressure, optimal_remaining_spend, max_bid_recommendation
- Note: Basic budget pacing already exists — this upgrades to full model with spend curve

#### 5. Strategy Object (Anchor/Pivot Logic) — Phase 2 of spec
- User-defined strategy with primary_anchor player, max_overpay_pct, fallback_paths
- Engine detects overpay, transitions strategy_state, emits pivot signal

#### 6. Structured Alert System
- Alert triggers: severity > 0.65, strategy state changes, tier break imminent, inflation > 15%
- Alerts displayed in sidebar UI

### Performance Constraints
- < 300ms deterministic recompute
- Cache projections, avoid full dataset recompute per event
- Debounce rapid auction events

### Scope for This Phase (Phase 1 of spec's phased plan)
- Deterministic valuation engine (inflation-adjusted values)
- Scarcity model (upgraded from basic alerts)
- Inflation tracking
- Category gap analysis for user's team
- Budget curve model (upgraded from basic pacing)
- Structured alert system with severity scoring
- UI integration in extension sidebar

### Deferred to Later Phases
- AI narrator integration (spec Phase 3)
- Championship odds Monte Carlo simulator (spec Phase 4)
- Strategy object / anchor-pivot logic (spec Phase 2) — defer unless time permits
- Backend draft state storage
- Multi-agent alert prioritization

## Claude's Discretion

- How to structure the deterministic engine modules (single file vs multiple)
- Exact alert severity calculation formulas
- UI layout for new engine outputs in sidebar
- How to compute replacement level from available data
- Whether to use z-scores vs percentile for category projections
- Caching strategy for projections

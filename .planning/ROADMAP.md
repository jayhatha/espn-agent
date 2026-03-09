# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-02-21)
- ✅ **v1.1 Trades & History** — Phases 6-9 (shipped 2026-02-23)
- ✅ **v1.2 Draft Assistant** — Phases 10-16 (shipped 2026-03-03)
- ✅ **v1.3 Site Redesign** — Phases 17-18 (shipped 2026-03-03)
- ✅ **v1.4 Draft Engine** — Phases 20-25 (shipped 2026-03-05)
- 📋 **v2.0 Position Shopping List** — Phases 26-27 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-02-21</summary>

- [x] **Phase 1: Foundation & Critical Fixes** - ESPN adapter, snapshot orchestrator, projections ingest, encryption, rate limiting (6/6 plans) — completed 2026-02-19
- [x] **Phase 2: Authentication & Onboarding** - JWT auth, OAuth stubs, guided wizard (3/3 plans) — completed 2026-02-19
- [x] **Phase 3: Core Dashboard & Recommendations** - Team health, scarcity badges, waiver/trade recommendations, action items (3/3 plans) — completed 2026-02-20
- [x] **Phase 4: Advanced Features & Polish** - Draft rankings, lineup optimizer, streaming pitchers, trend charts (4/4 plans) — completed 2026-02-20
- [x] **Phase 5: Admin UI** - System health, user management, batch upload (2/2 plans) — completed 2026-02-21

</details>

<details>
<summary>✅ v1.1 Trades & History (Phases 6-9) — SHIPPED 2026-02-23</summary>

- [x] **Phase 6: Multi-Player Trade Foundation** - N-for-M trade evaluation with roster validation (2/2 plans) — completed 2026-02-21
- [x] **Phase 7: Historical Backfill & Timeline** - ESPN historical data and week-by-week standings (2/2 plans) — completed 2026-02-21
- [x] **Phase 8: Season Replay & Annotations** - Transaction markers and date range selection (completed 2026-02-21)
- [x] **Phase 9: Transaction Impact Analysis (Roto WPA)** - Per-move roto-points impact with counterfactual analysis (completed 2026-02-22)

</details>

<details>
<summary>✅ v1.2 Draft Assistant (Phases 10-16) — SHIPPED 2026-03-03</summary>

- [x] **Phase 10: ESPN Live Draft Assistant** - Chrome extension overlay with sidebar, pick detection, snake/auction support (6/6 plans) — completed 2026-02-25
- [x] **Phase 11: Draft Assistant Enhancements** - Player pool sync, value detection, league-agnostic projections (5/5 plans) — completed 2026-02-25
- [x] **Phase 12: Address Codebase Concerns** - Bugs, debt, fragile selectors, free agents, fuzzy matching (5/5 plans) — completed 2026-02-26
- [x] **Phase 13: Clean Up Tech Debt** - Zod validation, DLQ, type safety, shared components, LRU cache, tests (6/6 plans) — completed 2026-02-26
- [x] **Phase 14: ESPN Auction Values Bug Fix** - Pagination limit increase, diagnostic logging (1/1 plans) — completed 2026-02-28
- [x] **Phase 15: Fix Empty SGP Categories** - formula_id for RATE stats, admin page enum values (1/1 plans) — completed 2026-03-03
- [x] **Phase 16: ESPN Auction Pagination Fix** - x-fantasy-filter to headers, offset-based pagination (1/1 plans) — completed 2026-03-03

</details>

<details>
<summary>✅ v1.3 Site Redesign (Phases 17-18) — SHIPPED 2026-03-03</summary>

- [x] **Phase 17: Site Redesign** - Typography-driven design system, 18 routes migrated, WCAG AA (9/9 plans) — completed 2026-03-03
- [x] **Phase 18: Dashboard Compositional Layout** - Editorial composition, DM Serif Display, section alternation (2/2 plans) — completed 2026-03-03

</details>

<details>
<summary>✅ v1.4 Draft Engine (Phases 20-25) — SHIPPED 2026-03-05</summary>

- [x] **Phase 20: Deterministic Draft Engine** - Inflation, scarcity, category gap, budget curve, alert system (2/2 plans) — completed 2026-03-04
- [x] **Phase 21: Build Archetype Analysis** - FanGraphs bundle, greedy fill, archetype classifier, pivot players (3/3 plans) — completed 2026-03-05
- [x] **Phase 22: AI Narrator Layer** - Event-triggered LLM interpretation, GPT-4.1-mini, strategy state (3/3 plans) — completed 2026-03-05
- [x] **Phase 23: Roster Optimization Engine** - SGP max bid, Monte Carlo simulation, opponent modeling (3/3 plans) — completed 2026-03-05
- [x] **Phase 24: Narrator Optimization Signals** - topTargets, simulationEV, shouldBid, opponentPressure (1/1 plans) — completed 2026-03-05
- [x] **Phase 25: Projected Standings Engine** - Full-season category/overall rankings during draft with sidebar integration (2/2 plans) — completed 2026-03-05

</details>

### 📋 v2.0 Position Shopping List (Planned)

**Milestone Goal:** Replace the generic Top Targets section with a position-organized shopping list that shows the best available players at each unfilled position, with max bids and market prices, prioritized by a combined scarcity + roster needs + budget fit score

- [x] **Phase 26: Per-Position Target Engine** - Compute per-position top N targets with combined priority scoring, dynamic updates, multi-position eligibility (completed 2026-03-06)
- [x] **Phase 27: Shopping List UI** - Replace Top Targets with collapsible position groups, player rows with bid data, priority ordering (completed 2026-03-06)

## Phase Details

### Phase 6: Multi-Player Trade Foundation
**Goal:** Users can propose and evaluate multi-player trades (2-for-2, 3-for-1, N-for-M) with accurate projected standings impact
**Depends on:** Phase 5 (v1.0 complete)
**Requirements:** TRADE-01, TRADE-02, TRADE-03, TRADE-04
**Success Criteria** (what must be TRUE):
  1. User can propose an N-for-M trade (up to 3-for-3) and see projected overall standings delta
  2. User sees category-by-category impact breakdown (rank changes for HR, RBI, AVG, ERA, etc.)
  3. System prevents illegal trades by validating roster slot constraints before showing results
  4. Multi-player rate stats (AVG, OBP, ERA, WHIP) use component-based math (H/AB not averaged rates)
**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md — Backend roster validation, 3-per-side enforcement, /trades/validate endpoint, and integration tests (TDD) — completed 2026-02-21
- [x] 06-02-PLAN.md — Frontend multi-player trade builder with selection limits, real-time validation, and category breakdown — completed 2026-02-21

### Phase 7: Historical Backfill & Timeline
**Goal:** Users can view week-by-week standings progression for their league's current and past seasons
**Depends on:** Phase 6
**Requirements:** HIST-01, HIST-02, HIST-03, HIST-04, TIME-01
**Success Criteria** (what must be TRUE):
  1. Admin can trigger historical data backfill for a league's past season via admin dashboard
  2. Backfill runs as background job without blocking UI, with progress tracking visible to admin
  3. Backfill respects ESPN rate limits (2-second throttle, exponential backoff on 429 errors)
  4. Transaction deduplication prevents duplicate entries when backfilling overlapping date ranges
  5. User can view week-by-week standings progression as a line chart for any season with collected data
**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md — Backend backfill infrastructure: ESPN historical fetch, backfill agent with rate limiting and transaction dedup, BullMQ worker, admin API endpoints — completed 2026-02-21
- [x] 07-02-PLAN.md — Frontend backfill UI (admin trigger + progress tracking) and season-filtered timeline on trends page — completed 2026-02-21

### Phase 07.2: Research and fix standings over time — counting stat values an order of magnitude too small in backfill snapshots (INSERTED)

**Goal:** Fix counting stat values in backfill snapshots that appear ~10x smaller than expected by diagnosing and correcting the data extraction in writeCurrentStandingsFromPlayerStats
**Depends on:** Phase 7
**Requirements:** TIME-01-fix-07.2
**Success Criteria** (what must be TRUE):
  1. Backfill counting stats (HR, RBI, R, SB, K, W, SV) are within expected magnitude (20-90 HR at mid-season, not 2-3)
  2. Week-over-week accumulation produces increasing cumulative totals
  3. Rate stats (AVG, ERA, WHIP) from accumulated components are in reasonable ranges
**Plans:** 1/1 plans complete

Plans:
- [x] 07.2-01-PLAN.md — Diagnose root cause via debug logging and ESPN response inspection, implement fix, verify with re-backfill -- completed 2026-02-22

### Phase 07.1: Historical Stats Accumulation & Dynamic Categories (INSERTED)

**Goal:** Fix historical backfill to produce accurate week-by-week standings by accumulating per-period player stats and use league-defined scoring categories
**Depends on:** Phase 7
**Requirements:** TIME-01-fix
**Success Criteria** (what must be TRUE):
  1. Backfill produces per-week standings that actually differ (not identical across all weeks)
  2. Stats are accumulated from per-period player data (statSplitTypeId=5), filtered to active roster only
  3. Rate stats use component-based math (accumulate H/AB, ER/OUTS, not average rates)
  4. League-defined scoring categories used for ranking (from league_settings_version)
  5. Frontend trends page uses dynamic categories from API, not hardcoded list
**Plans:** 2/2 plans complete

Plans:
- [ ] 07.1-01-PLAN.md — Backend per-period player stat accumulation, rate stat component math, league categories endpoint
- [ ] 07.1-02-PLAN.md — Frontend dynamic category dropdown replacing hardcoded list

### Phase 8: Season Replay & Annotations
**Goal:** Users can see how transactions affected their standings over time with visual annotations
**Depends on:** Phase 7
**Requirements:** TIME-02, TIME-03
**Success Criteria** (what must be TRUE):
  1. Timeline chart shows transaction annotations (trades, waiver adds/drops) at the weeks they occurred
  2. User can hover over annotation markers to see transaction details (players involved, date, teams)
  3. User can select different seasons or custom date ranges for timeline view
**Plans:** 1/1 plans complete

Plans:
- [ ] 08-01-PLAN.md — Enrich annotations endpoint with player names, build TransactionMarker and DateRangeFilter components, integrate into trends page

### Phase 9: Transaction Impact Analysis (Roto WPA)
**Goal:** Users see the roto-points impact of every roster move — from draft picks through the final add/drop — showing which moves helped/hurt their season the most
**Depends on:** Phase 7 (needs historical backfill snapshots with per-player data)
**Requirements:** IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04
**Success Criteria** (what must be TRUE):
  1. Per-player per-period stats stored during backfill, enabling individual contribution tracking
  2. Roster moves derived from weekly snapshot diffs with draft picks identified from opening-day roster
  3. Each move shows roto-points impact computed via counterfactual analysis (actual vs what-if-you-hadn't-made-this-move) (UPGRADE: Shapley values)
  4. Frontend shows impact timeline, move leaderboard (best/worst moves), and draft pick report (UPGRADE: confidence indicators, SGP)
**Plans:** 2/2 plans complete

Plans:
- [ ] 09-01-PLAN.md — Shapley value computation, SGP category normalization, replacement-level baselines, DB migration
- [ ] 09-02-PLAN.md — Bootstrap confidence intervals, API updates, frontend confidence/SGP/replacement-level UI

### Phase 10: ESPN Live Draft Assistant

**Goal:** Chrome extension that overlays ESPN's live draft page, providing real-time player recommendations, roster tracking, and value analysis for both snake and auction drafts
**Depends on:** Phase 9
**Requirements:** []
**Success Criteria** (what must be TRUE):
  1. Extension loads on ESPN draft pages and injects sidebar overlay
  2. MutationObserver detects picks in real-time and updates draft state
  3. Snake draft users see BPA recommendations, pair recommendations at turn, and roster summary
  4. Auction draft users see budget pacing tracker, dollar value recommendations, and spend guidance
  5. Draft state persists across page refreshes via chrome.storage.local
**Plans:** 6/6 plans complete

Plans:
- [x] 10-01-PLAN.md — WXT extension setup, manifest config, baseline rankings bundle, API client
- [x] 10-02-PLAN.md — Zustand draft state with chrome.storage.local persistence, snake/auction value calculations
- [x] 10-03-PLAN.md — Content script with Shadow DOM sidebar injection, MutationObserver for pick detection
- [x] 10-04-PLAN.md — Snake draft UI: BPA recommendations, pair recommendations, roster summary
- [x] 10-05-PLAN.md — Auction draft UI: budget pacing tracker, dollar value recommendations
- [x] 10-06-PLAN.md — Pick value tracking (overpay/underpay indicators), pre-draft ranking overrides, ADP/countdown display

### Phase 11: Draft Assistant Enhancements - player pool sync, value detection, and league-agnostic projections

**Goal:** Extension provides accurate value-based draft recommendations by syncing player pool data, detecting league configurations, and refreshing projections automatically after each pick
**Depends on:** Phase 10
**Requirements:** []
**Success Criteria** (what must be TRUE):
  1. Backend syncs ESPN player pool daily (stats, ownership %) to shared database table
  2. Extension detects league config from ESPN draft page DOM (categories, roster slots, teams)
  3. Rankings auto-refresh after each pick detection with retry logic
  4. Snake draft shows color-coded value indicators (10+ pick steals = green, reaches = red)
  5. Auction draft shows percentage discount/overpay indicators (15%+ discount = green)
  6. Valuation logic audited and corrected for accuracy
**Plans:** 5/5 plans complete

Plans:
- [ ] 11-01-PLAN.md — Audit and fix existing valuation logic (backend + extension)
- [ ] 11-02-PLAN.md — Backend player pool sync (DB migration, sync agent, daily cron job)
- [ ] 11-03-PLAN.md — Extension league config detection and auto-refresh on pick
- [ ] 11-04-PLAN.md — Extension value detection UI (red/yellow/green badges)
- [ ] 11-05-PLAN.md — Backend projected standings endpoint (league-agnostic)

### Phase 12: address codebase concerns

**Goal:** Systematically fix known bugs, complete partial features, and improve code quality by addressing documented concerns in progressive depth order (bugs first, quick wins, deeper refactors)
**Depends on:** Phase 11
**Requirements:** CONCERN-BUG-01, CONCERN-BUG-02, CONCERN-BUG-04, CONCERN-DEBT-01, CONCERN-DEBT-02, CONCERN-DEBT-03, CONCERN-DEBT-05, CONCERN-DEBT-06, CONCERN-DEBT-08, CONCERN-FRAGILE-02, CONCERN-FRAGILE-03, CONCERN-PERF-01
**Success Criteria** (what must be TRUE):
  1. Injury data populated in morning reports with actual player positions
  2. Draft recommendations return actual rankings instead of placeholder
  3. Extension DOM selectors have validation and graceful degradation
  4. Free agent pool populated during snapshot orchestration
  5. Player name matching uses fuzzy resolution as primary path
  6. Frontend pages use centralized API client (no hardcoded localhost URLs)
  7. WHERE IN clauses have empty array guards to prevent SQL crashes
  8. Transactions tracked during snapshot with deduplication
  9. Snapshot orchestrator has error boundaries for partial failures
  10. Trade recommendations include rate stat adjustments (AVG, ERA, WHIP)
**Plans:** 5/5 plans complete

Plans:
- [x] 12-01-PLAN.md — Fix critical bugs: injury data extraction, draft recommendations endpoint, DOM selector validation — completed 2026-02-26
- [ ] 12-02-PLAN.md — Wire up free agent fetch and make fuzzy player matching primary path
- [ ] 12-03-PLAN.md — Replace hardcoded API URLs and add empty array guards

### Phase 13: Clean up tech debt

**Goal:** Fix critical bugs silently producing incorrect data, close security vulnerabilities, eliminate performance bottlenecks, and improve type safety across backend and frontend
**Depends on:** Phase 12
**Requirements:** DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05, DEBT-06, DEBT-07, DEBT-08, DEBT-09, DEBT-10
**Success Criteria** (what must be TRUE):
  1. TradeRecommendationAgent accesses projection data correctly (no silent failures)
  2. N+1 query patterns replaced with batch operations (120+ INSERTs → 1 batch)
  3. All API request bodies validated with Zod schemas (no crashes on malformed input)
  4. OAuth CSRF state validated on callback (no security vulnerabilities)
  5. BullMQ failed jobs moved to DLQ for inspection (no silent failures)
  6. Workers don't call process.exit() (no crashes affecting co-located workers)
  7. Frontend `any` types replaced with proper interfaces (28 violations fixed)
  8. Shared frontend components extracted (no duplication)
  9. ESPNAdapter uses bounded LRU cache (no memory leaks)
  10. Critical paths have test coverage (TradeRecommendation, ESPNAdapter, auth routes)
**Plans:** 6/6 plans complete

Plans:
- [x] 13-01-PLAN.md — Fix TradeRecommendationAgent projection access bug and batch N+1 operations — completed 2026-02-26
- [x] 13-02-PLAN.md — Add Zod request validation and OAuth CSRF validation — completed 2026-02-26
- [x] 13-03-PLAN.md — Configure BullMQ DLQ and fix worker stability — completed 2026-02-26
- [x] 13-04-PLAN.md — Replace frontend any types and extract shared components — completed 2026-02-26
- [x] 13-05-PLAN.md — ESPNAdapter improvements: LRU cache, rate limiting, schema validation — completed 2026-02-26
- [x] 13-06-PLAN.md — Add tests for critical paths — completed 2026-02-26

### Phase 14: ESPN Auction Values Bug Fix

**Goal:** Fix ESPN auction values endpoint returning only 6 players instead of full player pool by increasing pagination limit and adding diagnostic logging
**Depends on:** Phase 13
**Requirements:** BUGFIX-ESPN-AUCTION-VALUES
**Success Criteria** (what must be TRUE):
  1. Auction validation endpoint returns 500+ players with ESPN auction values
  2. Players span multiple positions (C, 1B, 2B, 3B, SS, OF, SP, RP)
  3. Response includes high-ownership (>50%) and low-ownership (<10%) players
  4. Diagnostic logging shows actual ESPN response metrics
**Plans:** 1/1 plans complete

Plans:
- [x] 14-01-PLAN.md — Increase x-fantasy-filter limit to 2000, add diagnostic logging, add integration test

### Phase 15: Fix empty categories in SGP calculation - categories not passing through to DraftRankingsAgent causing all auction values to be $1

**Goal:** Fix categories data flow bug causing all auction values to collapse to $1 by ensuring formula_id is included for RATE stats in both extension DOM detection and admin page
**Depends on:** Phase 14
**Plans:** 1/1 plans complete

Plans:
- [ ] 15-01-PLAN.md — Fix DOM detector to include formula_id/required_components for RATE stats, fix admin page enum values, add unit tests

### Phase 16: ESPN auction values pagination - ESPN caps responses at 50 players regardless of limit, implement offset-based pagination to fetch full 500+ player pool

**Goal:** Fix ESPN returning only 50 players in auction value and free agent fetches by moving x-fantasy-filter from URL params to HTTP headers, and add offset-based pagination to fetchPreDraftAuctionValues to retrieve the full 500+ player pool
**Depends on:** Phase 15
**Requirements:** BUGFIX-ESPN-PAGINATION
**Plans:** 1/1 plans complete

Plans:
- [ ] 16-01-PLAN.md — Fix x-fantasy-filter transport (params -> headers) in fetchFreeAgents and fetchPreDraftAuctionValues, add sortDraftRanks to auction filter, implement offset-based pagination loop in fetchPreDraftAuctionValues

### Phase 17: Site redesign -- typography-driven, high-end creative design system with improved spacing, navigation, accessibility, and performance

**Goal:** Refactor the frontend to follow a restrained, typography-driven, high-end creative design system with increased whitespace, simplified navigation, stronger hierarchy, reduced visual clutter, subtle motion, and WCAG AA accessibility
**Depends on:** Phase 16
**Requirements:** DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07
**Success Criteria** (what must be TRUE):
  1. Design token system defined (typography scale, color palette, spacing, shadows) in tailwind.config.js
  2. Shared component library created (Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn)
  3. Navigation redesigned with lucide-react icons, design tokens, and WCAG AA accessibility
  4. All 18 routes migrated to use design system components
  5. No gradient backgrounds, heavy shadows, or dangerouslySetInnerHTML for emojis
  6. Scroll-reveal animations on landing page respecting prefers-reduced-motion
  7. Skip-to-content link, focus-visible states, and proper aria attributes throughout
**Plans:** 9/9 plans complete

Plans:
- [ ] 17-01-PLAN.md — Install dependencies (tailwind-merge, cva, lucide-react), define design tokens in Tailwind config, create cn() utility, clean globals.css, update root layout
- [ ] 17-02-PLAN.md — Create component library: Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn
- [ ] 17-03-PLAN.md — Redesign navigation and refactor shared UI components (PageHeader, StatCard, LoadingSpinner, ErrorAlert, StatsTable)
- [ ] 17-04-PLAN.md — Redesign landing page, login, signup, and onboarding pages
- [ ] 17-05-PLAN.md — Migrate league list, connect, and dashboard pages with league components
- [ ] 17-06-PLAN.md — Migrate trades, waivers, standings pages with player/impact components
- [ ] 17-07-PLAN.md — Migrate trends, moves, projections pages with chart theming
- [ ] 17-08-PLAN.md — Migrate draft rankings, auction, lineup, streaming, and admin pages
- [ ] 17-09-PLAN.md — Remove legacy config, verify no anti-patterns, visual verification checkpoint

### Phase 18: Refactor dashboard from card-based SaaS layout into composition-driven layout inspired by high-end creative web design

**Goal:** Transform the league dashboard from a card-grid SaaS layout into a composition-driven editorial layout with DM Serif Display typography, section-based background alternation, asymmetric grids, oversized impact numbers, and reduced visual borders
**Depends on:** Phase 17
**Success Criteria** (what must be TRUE):
  1. DM Serif Display renders on display-scale and h1/h2 headings; Inter on body/UI
  2. Dashboard uses alternating section backgrounds instead of floating Card wrappers
  3. Identity section shows team name, rank, and points with editorial typography scale
  4. Recommended Actions is the dominant visual section with oversized point deltas
  5. Health + chart grid uses asymmetric 8/4 column layout
  6. Quick actions rendered as compact text links, not bordered icon cards
  7. Data tables use tighter padding with text-data monospace for values
  8. All existing functionality preserved (team selector, auth modal, snapshot, roster)
**Plans:** 2/2 plans complete

Plans:
- [x] 18-01-PLAN.md — Install DM Serif Display font, configure typography foundation, decompose dashboard into 6 section components with compositional layout — completed 2026-03-03
- [x] 18-02-PLAN.md — Rework ActionItemsList, TeamHealthOverview, CategoryStatsTable, and roster tables to match editorial style, visual verification — completed 2026-03-03

### Phase 19: Apply Phase 18 editorial composition design to Chrome extension package — share design tokens, DM Serif Display font, divider-list patterns, spacing hierarchy, and alternating section backgrounds across popup settings UI and draft sidebar overlay

**Goal:** [To be planned]
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)

### Phase 20: Deterministic draft engine — inflation model, category gap projections, budget curve, strategy anchors with pivot logic, and structured alert system for extension sidebar

**Goal:** Build a client-side deterministic draft intelligence engine with four pure-function models (inflation, positional scarcity, category gap, budget curve) and a structured alert system, all running in the Chrome extension sidebar during live auction drafts
**Depends on:** Phase 19
**Requirements:** ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-05
**Success Criteria** (what must be TRUE):
  1. Inflation model tracks remaining budget vs remaining projected value, recomputes per pick, clamped 0.5-2.0
  2. Positional scarcity model computes supply/demand/tier_drop_value/scarcity_index per position
  3. Category projection engine computes z-score gaps per category for user's team vs league average
  4. Budget curve model computes budget_pressure, optimal_remaining_spend, max_bid_recommendation
  5. Structured alert system surfaces alerts with severity > 0.65 in the sidebar UI
  6. All engine code is pure deterministic functions (no AI computation)
  7. Engine recomputes in < 300ms with performance logging
**Plans:** 2/2 plans complete

Plans:
- [ ] 20-01-PLAN.md — Extend Zustand store with allTeamBudgets and leagueCategories, create lib/engine/ with inflation, scarcity, category-gap, budget-curve models, alert generator, and orchestrator
- [ ] 20-02-PLAN.md — Create useDraftEngineSignals hook, EngineAlerts and EngineInsights components, integrate into DraftSidebar, upgrade AuctionBudgetTracker

### Phase 21: Dynamic build archetype analysis — show how roster commitments constrain remaining draft strategy using FanGraphs projections and auction values

**Goal:** Show the user during a live auction draft how their roster picks shape their team archetype and what strategic paths remain, by computing category ceilings via greedy fill, classifying build archetypes, and identifying pivot players — all using bundled FanGraphs projections and auction values running offline in the extension sidebar
**Depends on:** Phase 20
**Success Criteria** (what must be TRUE):
  1. FanGraphs leaderboard projections and auction calculator data bundled as typed JSON assets in the extension
  2. Category ceilings computed via greedy fill showing current totals, optimal-fill maximums, and competitive targets
  3. Archetype classifier labels the team build (Power Build, Speed Build, Pitching-First, Balanced, etc.) with confidence indicator
  4. Punt detection flags categories where ceiling falls below 70% of competitive target
  5. Pivot players identified — specific affordable undrafted players that would unlock category ceiling improvements
  6. Build Analysis panel replaces Category Gaps section in EngineInsights, collapsed by default
  7. All engine code is pure deterministic functions within 300ms performance budget
**Plans:** 3/3 plans complete

Plans:
- [ ] 21-01-PLAN.md — Convert FanGraphs CSVs to bundled JSON assets, create typed data module, extend engine types with BuildArchetypeSignal
- [ ] 21-02-PLAN.md — Implement computeBuildArchetype pure function with greedy fill, archetype classification, ceiling computation (TDD), wire into engine orchestrator
- [ ] 21-03-PLAN.md — Create BuildArchetypePanel UI component, replace Category Gaps in EngineInsights, visual verification

### Phase 22: AI narrator layer — event-triggered LLM interpretation of deterministic engine signals with tactical commentary, strategy state transitions, and anchor/pivot explanations in the extension sidebar

**Goal:** Add an LLM narration layer that interprets the deterministic engine's structured signals during live auction drafts, providing tactical commentary via a backend OpenAI endpoint called by the extension when meaningful thresholds are met
**Depends on:** Phase 21
**Plans:** 3/3 plans complete

Plans:
- [ ] 22-01-PLAN.md — Install OpenAI SDK, create DraftNarratorAgent with system prompt and gpt-4.1-mini, add POST /api/draft/narrate route
- [ ] 22-02-PLAN.md — Create narrator Zustand store (non-persisted), NarratorPayload type, useNarrator hook with trigger/debounce/session cap, add strategy object to draft store
- [ ] 22-03-PLAN.md — Create DraftNarrator UI component with Ask button and calls counter, StrategySetup component, wire into DraftSidebar

### Phase 23: Roster optimization engine with marginal-value max bid, Monte Carlo draft simulation, dynamic replacement levels, and opponent need modeling — adapted from draft engine spec to TypeScript extension

**Goal:** The extension sidebar provides a data-driven SGP-based max-bid recommendation for every nominated player in an auction draft, backed by greedy roster optimization, Monte Carlo simulation of remaining draft outcomes, and opponent need awareness — all running as pure TypeScript functions within the 100ms performance budget
**Depends on:** Phase 22
**Plans:** 3/3 plans complete

Plans:
- [ ] 23-01-PLAN.md — SGP model with vectorized computation, dynamic replacement levels, and greedy knapsack roster optimizer (TDD)
- [ ] 23-02-PLAN.md — Bid optimizer (binary-search max bid), opponent need model, and Monte Carlo draft simulation (TDD)
- [ ] 23-03-PLAN.md — Wire all modules into computeDraftEngine orchestrator and surface max bid, targets, and bid/pass signals in sidebar UI

### Phase 24: Feed Phase 23 optimization signals to narrator — add topTargets, simulationEV, shouldBid, maxBid, and opponentPressure to NarratorPayload for richer AI tactical advice during auction drafts

**Goal:** Pipe Phase 23 roster optimization signals (topTargets, simulationEV, shouldBid, maxBid, opponentPressure) through the narrator pipeline so the AI advisor references SGP-based bid recommendations, Monte Carlo simulation confidence, and opponent competition in tactical commentary. Also add a nomination trigger so the narrator fires when a new player is nominated.
**Depends on:** Phase 23
**Requirements:** NARRATOR-OPT-01, NARRATOR-OPT-02, NARRATOR-OPT-03
**Plans:** 1/1 plans complete

Plans:
- [ ] 24-01-PLAN.md — Add optimization fields to NarratorPayload (both sides), update payload builder with nomination trigger, update backend buildUserMessage and system prompt

### Phase 25: Projected standings engine — full-season category and overall rankings for all teams during draft with draft-progress weighting and sidebar integration

**Goal:** Project full-season roto standings for all teams during a live auction draft using replacement-level filler for remaining roster slots, draft-progress confidence weighting, and weak-category boost for top-target recommendations — surfaced in the extension sidebar as a Projected Standings section
**Depends on:** Phase 24
**Plans:** 2/2 plans complete

Plans:
- [ ] 25-01-PLAN.md — Add projected standings types, refactor league-analysis.ts to expose teamDraftedTotals, create projected-standings.ts pure function module
- [ ] 25-02-PLAN.md — Wire into engine orchestrator as step 5c with weak-category boost, add Projected Standings UI section to EngineInsights sidebar

### Phase 26: Per-Position Target Engine

**Goal:** The draft engine computes a position-organized shopping list — per-position top N targets ranked by adjusted SGP value, with max bids and expected market prices, ordered by a combined priority score blending scarcity urgency, empty roster slot count, and budget fit — updating dynamically after every pick
**Depends on:** Phase 25
**Requirements:** TARG-01, TARG-02, TARG-03, TARG-04, TARG-05, PRIO-01, PRIO-02, PRIO-03
**Success Criteria** (what must be TRUE):
  1. Engine produces a shopping list keyed by position, each entry containing top N available players sorted by adjusted SGP value
  2. Each player entry includes max bid estimate and expected market price (opponent model), alongside a value surplus (max bid minus expected market price)
  3. Positions are ordered by a combined priority score that weights scarcity index, number of unfilled roster slots at that position, and remaining budget relative to target prices
  4. Positions with zero unfilled roster slots are excluded from the output entirely
  5. Multi-position eligible players (e.g., 1B/3B) appear as candidates under each position they qualify for
  6. Shopping list recomputes correctly after each pick — filled positions drop off, scarcity updates propagate, and position ordering re-sorts
**Plans:** 2/2 plans complete

Plans:
- [ ] 26-01-PLAN.md — Shopping list types, computeShoppingList pure function with priority scoring and multi-position eligibility (TDD)
- [ ] 26-02-PLAN.md — Wire computeShoppingList into engine orchestrator, dynamic update verification

### Phase 27: Shopping List UI

**Goal:** The extension sidebar displays a position-organized shopping list replacing the Top Targets section, with collapsible position groups ordered by priority score, player rows showing name and bid data, and graceful collapse when the roster is complete
**Depends on:** Phase 26
**Requirements:** SHOP-01, SHOP-02, SHOP-03, SHOP-04, SHOP-05
**Success Criteria** (what must be TRUE):
  1. Top Targets section in EngineInsights is replaced by a Shopping List section backed by the Phase 26 engine output
  2. Each position renders as a collapsible group with a position label and a visual priority indicator (e.g., urgency badge or score)
  3. Each player row within a group shows player name, max bid, expected market price, and value surplus
  4. Position groups are ordered highest-priority first, matching the combined priority score from the engine
  5. When no unfilled roster positions remain, the Shopping List section collapses to a compact completion state rather than showing an empty list
**Plans:** 1/1 plans complete

Plans:
- [ ] 27-01-PLAN.md — Create ShoppingList.tsx component and replace Top Targets section in EngineInsights with position-grouped shopping list

### Phase 28: Forward-looking draft simulation — full draft completion Monte Carlo with standings-based decision comparison, nomination strategy, and win probability

**Goal:** Evolve the single-pick Monte Carlo engine into a full draft completion simulator that evaluates decisions by their impact on projected roto standings, produces win probability distributions, and recommends trap nominations to drain opponent budgets — all running as pure client-side TypeScript functions within a 1-second performance budget in the Chrome extension sidebar
**Depends on:** Phase 27
**Requirements:** SIM-01, SIM-02, SIM-03, SIM-04, SIM-05, SIM-06, SIM-07, SIM-08
**Success Criteria** (what must be TRUE):
  1. Full draft completion simulation runs 300 iterations of all remaining picks using softmax-weighted selection per team
  2. Decisions evaluated by simulated standings impact (expected finish, win probability, top-3%) not raw SGP
  3. Bid vs pass comparison produces empirical outcome distributions for each candidate action
  4. Nomination strategy identifies trap nominations that drain opponent budgets without benefiting the user
  5. Win probability, decision comparison, and nomination strategy displayed in sidebar
  6. Simulation results cached and invalidated on pick count + nomination change
  7. All simulation code is pure functions (no Zustand, no DOM) running under 1 second
  8. Rate stats in standings use component-based math via calculateFinalRate (never averaged)
**Plans:** 3/3 plans complete

Plans:
- [ ] 28-01-PLAN.md — Core simulation engine: types, draft-simulator.ts with softmax selection and standings computation, decision-comparison.ts with bid vs pass evaluation (TDD)
- [ ] 28-02-PLAN.md — Nomination strategy heuristics and orchestrator wiring into computeDraftEngine with caching
- [ ] 28-03-PLAN.md — Sidebar UI: Win Probability section with probability bars, bid vs pass comparison, Nomination Strategy section

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Critical Fixes | v1.0 | 6/6 | Complete | 2026-02-19 |
| 2. Authentication & Onboarding | v1.0 | 3/3 | Complete | 2026-02-19 |
| 3. Core Dashboard & Recommendations | v1.0 | 3/3 | Complete | 2026-02-20 |
| 4. Advanced Features & Polish | v1.0 | 4/4 | Complete | 2026-02-20 |
| 5. Admin UI | v1.0 | 2/2 | Complete | 2026-02-21 |
| 6. Multi-Player Trade Foundation | v1.1 | 2/2 | Complete | 2026-02-21 |
| 7. Historical Backfill & Timeline | v1.1 | 2/2 | Complete | 2026-02-21 |
| 7.1 Historical Stats Accumulation | v1.1 | 0/2 | Planning | - |
| 7.2 Fix Standings Values | v1.1 | 1/1 | Complete | 2026-02-22 |
| 8. Season Replay & Annotations | v1.1 | 1/1 | Complete | 2026-02-21 |
| 9. Transaction Impact (Roto WPA) | v1.1 | 2/2 | Complete | 2026-02-23 |
| 10. ESPN Live Draft Assistant | v1.2 | 6/6 | Complete | 2026-02-25 |
| 11. Draft Assistant Enhancements | v1.2 | 5/5 | Complete | 2026-02-25 |
| 12. Address Codebase Concerns | v1.2 | 5/5 | Complete | 2026-02-26 |
| 13. Clean Up Tech Debt | v1.2 | 6/6 | Complete | 2026-02-26 |
| 14. ESPN Auction Values Bug Fix | v1.2 | Complete    | 2026-02-28 | - |
| 15. Fix Empty SGP Categories | v1.2 | 1/1 | Complete | 2026-03-03 |
| 16. ESPN Auction Pagination Fix | v1.2 | 1/1 | Complete | 2026-03-03 |
| 17. Site Redesign | v1.3 | 9/9 | Complete | 2026-03-03 |
| 18. Dashboard Compositional Layout | v1.3 | Complete    | 2026-03-03 | 2026-03-03 |
| 20. Deterministic Draft Engine | v1.4 | 2/2 | Complete    | 2026-03-04 |
| 21. Build Archetype Analysis | v1.4 | 3/3 | Complete   | 2026-03-05 |
| 22. AI Narrator Layer | v1.4 | 3/3 | Complete | 2026-03-05 |
| 23. Roster Optimization Engine | v1.4 | 3/3 | Complete | 2026-03-05 |
| 24. Narrator Optimization Signals | v1.4 | 1/1 | Complete | 2026-03-05 |
| 25. Projected Standings Engine | v1.4 | 2/2 | Complete | 2026-03-05 |
| 26. Per-Position Target Engine | 2/2 | Complete    | 2026-03-06 | - |
| 27. Shopping List UI | 1/1 | Complete    | 2026-03-06 | - |
| 28. Forward-Looking Draft Simulation | 3/3 | Complete    | 2026-03-06 | - |
| 29. Ideal Roster Optimizer | 2/2 | Complete    | 2026-03-07 | - |

### Phase 29: Ideal roster optimizer — show the best possible roster given remaining budget, slots, and available player pool in the extension sidebar

**Goal:** Display the greedy-optimal ideal roster in the extension sidebar showing the best possible team given remaining budget, slots, and available player pool, with anchor/core/value tier classification and locked drafted players
**Depends on:** Phase 28
**Requirements:** ENHANCEMENT
**Success Criteria** (what must be TRUE):
  1. Engine calls existing optimizeRoster() with rank-boosted SGP values and locked drafted players
  2. Each player classified as anchor (>$20), core ($5-20), or value (<$5) by FanGraphs dollar value
  3. Sidebar shows collapsible Ideal Roster section with tier count summary and player rows
  4. Already-drafted players appear as locked with visual distinction from undrafted targets
  5. Ideal roster recomputes on pick count change only (cached on allPicks.length)
**Plans:** 2/2 plans complete

Plans:
- [ ] 29-01-PLAN.md — Add IdealRosterPlayer/IdealRosterSignal types, computeIdealRoster function with rank-boosted SGP, locked player handling, and cache
- [ ] 29-02-PLAN.md — Create IdealRosterPanel UI component, wire into EngineInsights between Shopping List and League Analysis

### Phase 30: Extension is kind of locking up. Let's do a perf and code quality audit.

**Goal:** [To be planned]
**Depends on:** Phase 29
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 30 to break down) (completed 2026-03-07)

### Phase 31: Serve a mobile-friendly page that connects to the extension via websocket so I can view and control the draft from my phone on my local network

**Goal:** Mobile-friendly draft companion page that connects to the Chrome extension via a Fastify WebSocket hub, displaying live engine signals (max bid, win probability, budget, alerts) and providing control over auto-bid, position filter, and pitcher/hitter split from the phone on the local network
**Depends on:** Phase 30
**Requirements:** WS-HUB-01, WS-HUB-02, WS-HUB-03, WS-EXT-01, WS-EXT-02, WS-EXT-03, WS-EXT-04, MOB-01, MOB-02, MOB-03, MOB-04, MOB-05
**Success Criteria** (what must be TRUE):
  1. Fastify backend accepts WebSocket upgrades at /draft/live with role-based routing (extension vs mobile)
  2. Extension background SW connects as WS client, relays state snapshots and engine signals to the hub
  3. Control commands from the phone travel through the WS hub to the extension and apply to the Zustand store
  4. Mobile page auto-detects LAN IP, shows live engine signals, and provides touch-optimized controls
  5. 20-second keepalive prevents service worker sleep; auto-reconnect handles backend restarts
**Plans:** 3/3 plans complete

Plans:
- [ ] 31-01-PLAN.md — Install @fastify/websocket, create /draft/live WebSocket hub route with fan-out relay, relax CORS for LAN
- [ ] 31-02-PLAN.md — Wire extension: write engine signals to storage, background SW WS client with keepalive/reconnect, content script CONTROL handler
- [ ] 31-03-PLAN.md — Mobile companion page at /draft/live with WS hook, live signal display, and touch controls (auto-bid, position filter, split)

### Phase 32: Ideal roster always needs to fill all spots.

**Goal:** Guarantee that optimizeRoster always fills every roster slot when eligible players exist in the pool, by adding a backfill pass after the greedy fill that uses relaxed budget constraints and force-places cheapest eligible players
**Depends on:** Phase 31
**Requirements:** ROSTER-FILL-01
**Success Criteria** (what must be TRUE):
  1. optimizeRoster returns unfilledSlots === 0 whenever the player pool contains eligible players for each remaining slot
  2. Backfill pass uses relaxed budget constraint (no $1/slot reserve) and force-places cheapest eligible player per unfilled slot
  3. Budget upgrade pass (Phase 4) runs after successful backfill when all slots are filled
  4. Existing greedy fill behavior is unchanged for normal (sufficient budget) scenarios
  5. All existing roster-optimizer tests pass without modification
**Plans:** 1/1 plans complete

Plans:
- [ ] 32-01-PLAN.md — Add backfill pass to optimizeRoster with TDD: failing tests for tight-budget and position-constraint scenarios, then implement backfill logic

### Phase 33: debug autopilot nomination flow

**Goal:** Instrument the autopilot nomination flow with structured diagnostic logging, fix the name normalization gap causing player ranking lookup failures, and add a live nomination diagnostics panel to the sidebar for real-time debugging during live drafts
**Depends on:** Phase 32
**Requirements:** DEBUG-NOM-01, DEBUG-NOM-02, DEBUG-NOM-03
**Success Criteria** (what must be TRUE):
  1. Every decision point in evaluateAndNominate() and isMyTurnToNominate() emits structured console logs
  2. Player name normalization uses normalizeName() (strips Jr./Sr./diacritics) not plain toLowerCase()
  3. Sidebar shows live nomination diagnostics (status, candidate, turn detection, attempts, cooldown) with force nominate button
  4. window.espnDraftAssistant.nominationDiag() available in DEV mode for console inspection
**Plans:** 1/1 plans complete

Plans:
- [x] 33-01-PLAN.md — Structured nomination logging, name normalization fix, NominationDiagnostics UI panel, force nominate button, window diagnostic exports

### Phase 34: Make sure we're not entirely punting categories. A test draft had no saves.

**Goal:** Prevent the draft engine from completely punting active scoring categories by adding a category floor enforcement pre-pass to the ideal roster optimizer, guaranteeing at least one contributor per zero-coverage counting category (e.g., SV, HLD) via lockedPlayers injection
**Depends on:** Phase 33
**Requirements:** CATEGORY-FLOOR-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 34-01-PLAN.md — Create category-floor.ts utilities (zero-coverage detection, floor pick selection) and wire into computeIdealRoster as lockedPlayers pre-pass

### Phase 35: Use the queue for player nominations instead of finding players on the fly

**Goal:** Replace fragile on-the-fly player search with ESPN queue-first auto-nomination — scrape queued players from DOM, prefer queue entries over engine candidates, bypass name-to-ID mapping
**Depends on:** Phase 34
**Plans:** 2/2 plans complete

Plans:
- [ ] 35-01-PLAN.md — Add ESPN nomination queue scraper and Zustand store field
- [ ] 35-02-PLAN.md — Wire queue scraper in content script, update auto-nomination to prefer queue, update diagnostics UI

### Phase 36: Code cleanup — verify and address concerns from CODE_REVIEW.md, skip security concerns that don't apply to local development (app is not deployed)

**Goal:** Fix verified correctness bugs (UTIL double-count, falsy category_id, stale engine caches, diverging normalizers), add robustness improvements (error boundaries, DEV-gated logger), and resolve frontend/infrastructure issues (NaN guards, debounce, Dockerfile fixes, @types/node alignment) from CODE_REVIEW.md findings -- security items excluded per local dev scope
**Depends on:** Phase 35
**Plans:** 1/3 plans executed

Plans:
- [ ] 36-01-PLAN.md — Fix correctness bugs: UTIL double-count (B-02), falsy category_id (B-12), engine cache isolation (E-02), normalizer consolidation (E-12)
- [ ] 36-02-PLAN.md — Extension robustness: React error boundaries (E-10), DEV-gated logger replacing 257 console statements (E-13)
- [ ] 36-03-PLAN.md — Frontend fixes (F-01 NaN guard, F-04 stale closure, F-05 debounce), backend snapshot degradation (B-08), infrastructure (I-01, I-02, I-04)
